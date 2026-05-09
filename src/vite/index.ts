import fs from "node:fs/promises";
import path from "node:path";

import type { IndexHtmlTransformContext, Plugin, ResolvedConfig } from "vite";

import { openPayload } from "../core/index.js";
import type { CompressionAlgorithm, CompressionCodec, CompressionMode } from "../format/types.js";
import { embedPayloadInHtml, embedWasmInHtml } from "../html/index.js";
import { packDirectory } from "../node/index.js";
import type { PackDirectoryOptions } from "../node/types.js";

export const BYTEDIST_VITE_VIRTUAL_MODULE_ID = "virtual:bytedist/payload";

const RESOLVED_VIRTUAL_MODULE_ID = `\0${BYTEDIST_VITE_VIRTUAL_MODULE_ID}`;
const DEFAULT_OUTPUT_NAME = "artifact.bytedist";

export interface ByteDistVitePluginOptions {
  readonly input: string;
  readonly outputName?: string;
  readonly emit?: boolean;
  readonly embed?: boolean | ByteDistViteEmbedOptions;
  readonly wasm?: string | ByteDistViteWasmOptions;
  readonly manifestPath?: string;
  readonly ignore?: readonly string[];
  readonly integrity?: PackDirectoryOptions["integrity"];
  readonly compression?: CompressionAlgorithm;
  readonly compressionMode?: CompressionMode;
  readonly compressionCodecs?: readonly CompressionCodec[];
  readonly createdBy?: string;
  readonly metadata?: PackDirectoryOptions["metadata"];
}

export interface ByteDistViteEmbedOptions {
  readonly marker?: string;
  readonly minified?: boolean;
  readonly lineLength?: number;
}

export interface ByteDistViteWasmOptions extends ByteDistViteEmbedOptions {
  readonly input: string;
}

export interface ByteDistViteChunkMetadata {
  readonly name: string;
  readonly length: number;
  readonly storedLength: number;
  readonly compression: string;
  readonly mime?: string;
  readonly encoding?: string;
  readonly hash?: {
    readonly algorithm: string;
    readonly value: string;
  };
}

export interface ByteDistVitePayloadMetadata {
  readonly outputName: string;
  readonly payloadSize: number;
  readonly emitted: boolean;
  readonly embedded: boolean;
  readonly manifestPath?: string;
  readonly chunkCount: number;
  readonly chunks: readonly ByteDistViteChunkMetadata[];
}

interface PayloadBuildResult {
  readonly bytes: Uint8Array;
  readonly metadata: ByteDistVitePayloadMetadata;
}

export function bytedistPlugin(options: ByteDistVitePluginOptions): Plugin {
  let config: ResolvedConfig | undefined;
  let payloadPromise: Promise<PayloadBuildResult> | undefined;

  const outputName = normalizeOutputName(options.outputName ?? DEFAULT_OUTPUT_NAME);
  const embedded = options.embed !== undefined && options.embed !== false;
  const emitted = options.emit ?? !embedded;

  async function ensurePayload(): Promise<PayloadBuildResult> {
    payloadPromise ??= buildPayload(config?.root ?? process.cwd(), options, outputName, {
      embedded,
      emitted
    });
    return payloadPromise;
  }

  return {
    name: "bytedist:vite",
    apply: "build",

    configResolved(resolvedConfig): void {
      config = resolvedConfig;
    },

    resolveId(id): string | undefined {
      return id === BYTEDIST_VITE_VIRTUAL_MODULE_ID ? RESOLVED_VIRTUAL_MODULE_ID : undefined;
    },

    async load(id): Promise<string | undefined> {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
        return undefined;
      }

      return renderVirtualModule((await ensurePayload()).metadata);
    },

    async generateBundle(): Promise<void> {
      if (!emitted) {
        return;
      }

      const payload = await ensurePayload();
      this.emitFile({
        type: "asset",
        fileName: outputName,
        source: payload.bytes
      });
    },

    async transformIndexHtml(html: string, context: IndexHtmlTransformContext): Promise<string> {
      void context;

      let output = html;
      if (embedded) {
        const payload = await ensurePayload();
        output = embedPayloadInHtml(output, payload.bytes, normalizeEmbedOptions(options.embed));
      }

      const wasmOptions = normalizeWasmOptions(options.wasm);
      if (wasmOptions !== undefined) {
        const wasmPath = resolveFromRoot(config?.root ?? process.cwd(), wasmOptions.input);
        const wasmBytes = await fs.readFile(wasmPath);
        output = embedWasmInHtml(output, wasmBytes, wasmOptions);
      }

      return output;
    }
  };
}

async function buildPayload(
  root: string,
  options: ByteDistVitePluginOptions,
  outputName: string,
  flags: {
    readonly embedded: boolean;
    readonly emitted: boolean;
  }
): Promise<PayloadBuildResult> {
  const inputDir = resolveFromRoot(root, options.input);
  const payloadOptions: PackDirectoryOptions = {
    ...(options.manifestPath === undefined ? {} : { manifestPath: options.manifestPath }),
    ...(options.ignore === undefined ? {} : { ignore: options.ignore }),
    integrity: options.integrity ?? "sha256",
    ...(options.compression === undefined ? {} : { compression: options.compression }),
    ...(options.compressionMode === undefined ? {} : { compressionMode: options.compressionMode }),
    ...(options.compressionCodecs === undefined
      ? {}
      : { compressionCodecs: options.compressionCodecs }),
    createdBy: options.createdBy ?? "bytedist/vite",
    ...(options.metadata === undefined ? {} : { metadata: options.metadata })
  };
  const bytes = await packDirectory(inputDir, payloadOptions);
  const archive = await openPayload(bytes, {
    ...(options.compressionCodecs === undefined
      ? {}
      : { compressionCodecs: options.compressionCodecs })
  });
  const toc = archive.getToc();

  return {
    bytes,
    metadata: {
      outputName,
      payloadSize: bytes.byteLength,
      emitted: flags.emitted,
      embedded: flags.embedded,
      ...(toc.manifest?.path === undefined ? {} : { manifestPath: toc.manifest.path }),
      chunkCount: toc.chunks.length,
      chunks: toc.chunks.map((chunk) => ({
        name: chunk.name,
        length: chunk.length,
        storedLength: chunk.storedLength,
        compression: chunk.compression,
        ...(chunk.mime === undefined ? {} : { mime: chunk.mime }),
        ...(chunk.encoding === undefined ? {} : { encoding: chunk.encoding }),
        ...(chunk.hash === undefined ? {} : { hash: chunk.hash })
      }))
    }
  };
}

function normalizeOutputName(outputName: string): string {
  const normalized = outputName.split(path.sep).join("/");

  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid ByteDist Vite outputName: ${outputName}`);
  }

  return normalized;
}

function normalizeEmbedOptions(
  embed: ByteDistVitePluginOptions["embed"]
): ByteDistViteEmbedOptions {
  return typeof embed === "object" && embed !== null ? embed : {};
}

function normalizeWasmOptions(
  wasm: ByteDistVitePluginOptions["wasm"]
): ByteDistViteWasmOptions | undefined {
  if (wasm === undefined) {
    return undefined;
  }

  return typeof wasm === "string" ? { input: wasm } : wasm;
}

function resolveFromRoot(root: string, input: string): string {
  return path.isAbsolute(input) ? input : path.resolve(root, input);
}

function renderVirtualModule(metadata: ByteDistVitePayloadMetadata): string {
  return [
    `const metadata = ${JSON.stringify(metadata)};`,
    "export default metadata;",
    "export { metadata };",
    `export const outputName = ${JSON.stringify(metadata.outputName)};`,
    `export const payloadSize = ${metadata.payloadSize};`,
    `export const emitted = ${JSON.stringify(metadata.emitted)};`,
    `export const embedded = ${JSON.stringify(metadata.embedded)};`,
    `export const manifestPath = ${JSON.stringify(metadata.manifestPath)};`,
    `export const chunkCount = ${metadata.chunkCount};`,
    "export const chunks = metadata.chunks;"
  ].join("\n");
}
