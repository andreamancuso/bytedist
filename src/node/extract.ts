import fs from "node:fs/promises";
import path from "node:path";

import { PayloadFormatError } from "../format/errors.js";
import type { OpenedPayload } from "../format/types.js";
import { assertValidChunkName } from "../format/validation.js";

export interface PlannedExtractionFile {
  readonly chunkName: string;
  readonly outputPath: string;
  readonly length: number;
}

export interface ExtractPayloadOptions {
  readonly overwrite?: boolean;
  readonly verify?: boolean;
}

export interface ExtractedPayloadFile extends PlannedExtractionFile {
  readonly bytesWritten: number;
}

const WINDOWS_RESERVED_BASENAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);

export async function planPayloadExtraction(
  archive: OpenedPayload,
  outputDir: string
): Promise<readonly PlannedExtractionFile[]> {
  const root = path.resolve(outputDir);
  const planned: PlannedExtractionFile[] = [];
  const seenTargets = new Map<string, string>();

  for (const chunk of archive.getToc().chunks) {
    const outputPath = resolveSafeExtractionPath(root, chunk.name);
    const normalizedOutputPath = normalizeCollisionPath(outputPath);
    const previousChunkName = seenTargets.get(normalizedOutputPath);

    if (previousChunkName !== undefined) {
      throw new PayloadFormatError(
        `ByteDist chunks ${previousChunkName} and ${chunk.name} map to the same extraction path.`
      );
    }

    seenTargets.set(normalizedOutputPath, chunk.name);
    planned.push({
      chunkName: chunk.name,
      outputPath,
      length: chunk.length
    });
  }

  return planned;
}

export async function extractPayloadToDirectory(
  archive: OpenedPayload,
  outputDir: string,
  options: ExtractPayloadOptions = {}
): Promise<readonly ExtractedPayloadFile[]> {
  if (options.verify === true) {
    await archive.verify();
  }

  const plannedFiles = await planPayloadExtraction(archive, outputDir);
  const extractedFiles: ExtractedPayloadFile[] = [];

  for (const plannedFile of plannedFiles) {
    await assertWritableTarget(plannedFile.outputPath, options.overwrite === true);
  }

  for (const plannedFile of plannedFiles) {
    const bytes = await archive.readBytes(plannedFile.chunkName);

    await fs.mkdir(path.dirname(plannedFile.outputPath), { recursive: true });
    await fs.writeFile(plannedFile.outputPath, bytes, {
      flag: options.overwrite === true ? "w" : "wx"
    });

    extractedFiles.push({
      ...plannedFile,
      bytesWritten: bytes.byteLength
    });
  }

  return extractedFiles;
}

function resolveSafeExtractionPath(root: string, chunkName: string): string {
  assertValidChunkName(chunkName);
  assertSafeExtractionName(chunkName);

  const outputPath = path.resolve(root, ...chunkName.split("/"));
  const relativePath = path.relative(root, outputPath);

  if (relativePath.length === 0 || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new PayloadFormatError(`ByteDist chunk ${chunkName} resolves outside output directory.`);
  }

  return outputPath;
}

function assertSafeExtractionName(chunkName: string): void {
  for (const segment of chunkName.split("/")) {
    if (/[<>:"|?*\x00-\x1f]/u.test(segment)) {
      throw new PayloadFormatError(
        `ByteDist chunk ${chunkName} contains a filename unsafe for extraction.`
      );
    }

    if (/[. ]$/u.test(segment)) {
      throw new PayloadFormatError(
        `ByteDist chunk ${chunkName} contains a filename with a trailing space or dot.`
      );
    }

    const basename = segment.split(".")[0]?.toUpperCase();
    if (basename !== undefined && WINDOWS_RESERVED_BASENAMES.has(basename)) {
      throw new PayloadFormatError(
        `ByteDist chunk ${chunkName} contains a Windows reserved filename.`
      );
    }
  }
}

function normalizeCollisionPath(outputPath: string): string {
  return path.resolve(outputPath).toLowerCase();
}

async function assertWritableTarget(outputPath: string, overwrite: boolean): Promise<void> {
  let stat;

  try {
    stat = await fs.lstat(outputPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  if (!overwrite) {
    throw new PayloadFormatError(`Output file already exists: ${outputPath}.`);
  }

  if (!stat.isFile()) {
    throw new PayloadFormatError(`Output path is not a regular file: ${outputPath}.`);
  }
}
