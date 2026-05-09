import fs from "node:fs/promises";
import path from "node:path";

import { createPayload } from "../core/index.js";
import { DEFAULT_MANIFEST_CHUNK_NAME } from "../format/constants.js";
import { PayloadFormatError } from "../format/errors.js";
import { assertNotReservedChunkName, assertValidChunkName } from "../format/validation.js";
import type { JsonValue, PayloadFileInput } from "../format/types.js";
import { createIgnoreMatcher } from "./ignore.js";
import { detectMimeType } from "./mime.js";
import type {
  CollectDirectoryFilesOptions,
  PackDirectoryOptions,
  WritePayloadFileOptions
} from "./types.js";

export async function collectDirectoryFiles(
  inputDir: string,
  options: CollectDirectoryFilesOptions = {}
): Promise<readonly PayloadFileInput[]> {
  const root = await resolveDirectory(inputDir);
  const ignored = createIgnoreMatcher(options.ignore);
  const files: PayloadFileInput[] = [];

  await collectFiles(root, root, ignored, files, {
    allowReservedChunkNames: options.allowReservedChunkNames === true
  });
  files.sort((left, right) => left.name.localeCompare(right.name));

  return files;
}

export async function packDirectory(
  inputDir: string,
  options: PackDirectoryOptions = {}
): Promise<Uint8Array> {
  const root = await resolveDirectory(inputDir);
  const manifestAbsolutePath =
    options.manifestPath === undefined
      ? undefined
      : await resolveManifestPath(root, options.manifestPath);
  const manifest =
    manifestAbsolutePath === undefined ? undefined : await readJsonFile(manifestAbsolutePath);
  const ignored = createIgnoreMatcher(options.ignore);
  const files: PayloadFileInput[] = [];

  await collectFiles(root, root, ignored, files, {
    ...(manifestAbsolutePath === undefined ? {} : { manifestAbsolutePath }),
    allowReservedChunkNames: options.allowReservedChunkNames === true
  });
  files.sort((left, right) => left.name.localeCompare(right.name));

  if (manifest !== undefined && files.some((file) => file.name === DEFAULT_MANIFEST_CHUNK_NAME)) {
    throw new PayloadFormatError(
      "Cannot pack an explicit manifest.json file when manifestPath is provided."
    );
  }

  return createPayload({
    ...(manifest === undefined ? {} : { manifest }),
    files,
    ...(options.integrity === undefined ? {} : { integrity: options.integrity }),
    ...(options.compression === undefined ? {} : { compression: options.compression }),
    ...(options.compressionMode === undefined ? {} : { compressionMode: options.compressionMode }),
    ...(options.compressionCodecs === undefined
      ? {}
      : { compressionCodecs: options.compressionCodecs }),
    ...(options.createdBy === undefined ? {} : { createdBy: options.createdBy }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    ...(options.allowReservedChunkNames === undefined
      ? {}
      : { allowReservedChunkNames: options.allowReservedChunkNames })
  });
}

export async function writePayloadFile(
  outputPath: string,
  bytes: Uint8Array,
  options: WritePayloadFileOptions = {}
): Promise<void> {
  if (!options.overwrite && (await pathExists(outputPath))) {
    throw new PayloadFormatError(`Output file already exists: ${outputPath}.`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes, { flag: options.overwrite ? "w" : "wx" });
}

async function collectFiles(
  root: string,
  currentDir: string,
  ignored: (chunkName: string) => boolean,
  files: PayloadFileInput[],
  options: {
    readonly manifestAbsolutePath?: string;
    readonly allowReservedChunkNames: boolean;
  }
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectFiles(root, absolutePath, ignored, files, options);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (
      options.manifestAbsolutePath !== undefined &&
      path.resolve(absolutePath) === options.manifestAbsolutePath
    ) {
      continue;
    }

    const chunkName = toChunkName(root, absolutePath);
    if (ignored(chunkName)) {
      continue;
    }

    assertValidChunkName(chunkName);
    if (!options.allowReservedChunkNames) {
      assertNotReservedChunkName(chunkName);
    }
    files.push({
      name: chunkName,
      bytes: await fs.readFile(absolutePath),
      mime: detectMimeType(absolutePath)
    });
  }
}

async function resolveDirectory(inputDir: string): Promise<string> {
  const absolutePath = path.resolve(inputDir);
  const stat = await fs.stat(absolutePath);

  if (!stat.isDirectory()) {
    throw new PayloadFormatError(`Input path is not a directory: ${inputDir}.`);
  }

  return absolutePath;
}

async function resolveManifestPath(root: string, manifestPath: string): Promise<string> {
  const absolutePath = path.resolve(root, manifestPath);
  const relativePath = path.relative(root, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new PayloadFormatError("manifestPath must point inside the input directory.");
  }

  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    throw new PayloadFormatError(`manifestPath is not a file: ${manifestPath}.`);
  }

  return absolutePath;
}

async function readJsonFile(filePath: string): Promise<JsonValue> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as JsonValue;
  } catch (error) {
    throw new PayloadFormatError(`Manifest file is not valid JSON: ${filePath}.`, { cause: error });
  }
}

function toChunkName(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}
