#!/usr/bin/env node
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { openPayload } from "../core/index.js";
import type { OpenedPayload } from "../format/types.js";
import { packDirectory, writePayloadFile } from "../node/index.js";

interface CliIo {
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

interface ParsedOptions {
  readonly values: ReadonlyMap<string, string>;
  readonly lists: ReadonlyMap<string, readonly string[]>;
  readonly flags: ReadonlySet<string>;
  readonly positionals: readonly string[];
}

const HELP_TEXT = `ByteDist CLI

Usage:
  bytedist --help
  bytedist pack <input-dir> --out <file> [--manifest <path>] [--ignore <pattern> ...] [--force] [--no-integrity]
  bytedist inspect <payload-file>
  bytedist verify <payload-file>

Commands:
  pack      Pack a directory into a .bytedist payload
  inspect   Print payload metadata and chunk records
  verify    Verify payload integrity metadata
`;

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  io: CliIo = {
    stdout: (message) => console.log(message),
    stderr: (message) => console.error(message)
  }
): Promise<number> {
  try {
    const [command, ...rest] = argv;

    if (command === undefined || command === "--help" || command === "-h" || command === "help") {
      io.stdout(HELP_TEXT.trimEnd());
      return 0;
    }

    if (command === "pack") {
      return await runPack(rest, io);
    }

    if (command === "inspect") {
      return await runInspect(rest, io);
    }

    if (command === "verify") {
      return await runVerify(rest, io);
    }

    io.stderr(`Unknown command: ${command}`);
    io.stderr("Run `bytedist --help` for usage.");
    return 1;
  } catch (error) {
    io.stderr(formatError(error));
    return 1;
  }
}

async function runPack(argv: readonly string[], io: CliIo): Promise<number> {
  const options = parseOptions(argv, {
    valueOptions: new Set(["--out", "--manifest"]),
    listOptions: new Set(["--ignore"]),
    flagOptions: new Set(["--force", "--no-integrity"])
  });
  const inputDir = options.positionals[0];
  const outputPath = options.values.get("--out");
  const manifestPath = options.values.get("--manifest");

  if (inputDir === undefined || outputPath === undefined || options.positionals.length > 1) {
    throw new Error("Usage: bytedist pack <input-dir> --out <file>");
  }

  const payload = await packDirectory(inputDir, {
    ...(manifestPath === undefined ? {} : { manifestPath }),
    integrity: options.flags.has("--no-integrity") ? false : "sha256",
    ignore: options.lists.get("--ignore") ?? []
  });
  await writePayloadFile(outputPath, payload, { overwrite: options.flags.has("--force") });

  const archive = await openPayload(payload);
  const toc = archive.getToc();

  io.stdout("Packed ByteDist payload");
  io.stdout(`Input: ${inputDir}`);
  io.stdout(`Output: ${outputPath}`);
  io.stdout(`Chunks: ${toc.chunks.length}`);
  io.stdout(`Payload size: ${payload.byteLength} bytes`);
  io.stdout(`Manifest: ${toc.manifest?.path ?? "none"}`);
  io.stdout(`Integrity: ${options.flags.has("--no-integrity") ? "none" : "sha256"}`);

  return 0;
}

async function runInspect(argv: readonly string[], io: CliIo): Promise<number> {
  const options = parseOptions(argv, {
    valueOptions: new Set(),
    listOptions: new Set(),
    flagOptions: new Set()
  });
  const payloadPath = options.positionals[0];

  if (payloadPath === undefined || options.positionals.length > 1) {
    throw new Error("Usage: bytedist inspect <payload-file>");
  }

  const bytes = await fs.readFile(payloadPath);
  const archive = await openPayload(bytes);
  printInspection(payloadPath, bytes.byteLength, archive, io);

  return 0;
}

async function runVerify(argv: readonly string[], io: CliIo): Promise<number> {
  const options = parseOptions(argv, {
    valueOptions: new Set(),
    listOptions: new Set(),
    flagOptions: new Set()
  });
  const payloadPath = options.positionals[0];

  if (payloadPath === undefined || options.positionals.length > 1) {
    throw new Error("Usage: bytedist verify <payload-file>");
  }

  try {
    const archive = await openPayload(await fs.readFile(payloadPath));
    await archive.verify();
    io.stdout(`Verification passed: ${payloadPath}`);
    return 0;
  } catch (error) {
    io.stderr(`Verification failed: ${errorMessage(error)}`);

    const chunkName = maybeChunkName(error);
    if (chunkName !== undefined) {
      io.stderr(`Chunk: ${chunkName}`);
    }

    return 1;
  }
}

function printInspection(
  payloadPath: string,
  payloadSize: number,
  archive: OpenedPayload,
  io: CliIo
): void {
  const toc = archive.getToc();

  io.stdout("ByteDist payload");
  io.stdout(`Path: ${payloadPath}`);
  io.stdout(`Format version: ${archive.formatVersion}`);
  io.stdout(`Payload size: ${payloadSize} bytes`);
  io.stdout(`Chunk count: ${toc.chunks.length}`);
  io.stdout(`Manifest: ${toc.manifest?.path ?? "none"}`);
  io.stdout("Chunks:");

  for (const chunk of toc.chunks) {
    io.stdout(
      `- ${chunk.name} | size=${chunk.length} | mime=${chunk.mime ?? "application/octet-stream"} | compression=${chunk.compression} | hash=${chunk.hash?.algorithm ?? "none"}`
    );
  }
}

function parseOptions(
  argv: readonly string[],
  known: {
    readonly valueOptions: ReadonlySet<string>;
    readonly listOptions: ReadonlySet<string>;
    readonly flagOptions: ReadonlySet<string>;
  }
): ParsedOptions {
  const values = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === undefined) {
      continue;
    }

    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    if (known.flagOptions.has(arg)) {
      flags.add(arg);
      continue;
    }

    if (known.valueOptions.has(arg) || known.listOptions.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}.`);
      }

      if (known.valueOptions.has(arg)) {
        values.set(arg, value);
      } else {
        const existing = lists.get(arg) ?? [];
        existing.push(value);
        lists.set(arg, existing);
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}.`);
  }

  return { values, lists, flags, positionals };
}

function formatError(error: unknown): string {
  return `Error: ${errorMessage(error)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function maybeChunkName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("chunkName" in error)) {
    return undefined;
  }

  const chunkName = (error as { readonly chunkName?: unknown }).chunkName;
  return typeof chunkName === "string" ? chunkName : undefined;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli();
}
