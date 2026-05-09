import {
  DEFAULT_COMPRESSION,
  DEFAULT_TOC_ENCODING,
  PAYLOAD_FORMAT_VERSION,
  PAYLOAD_FOOTER_LENGTH,
  PAYLOAD_HEADER_LENGTH
} from "../format/constants.js";
import {
  PayloadCompressionError,
  PayloadFormatError,
  PayloadIntegrityError
} from "../format/errors.js";
import { assertValidChunkName } from "../format/validation.js";
import type {
  CompressionAlgorithm,
  CompressionMode,
  CreatePayloadOptions,
  JsonValue,
  PayloadChunkRecord,
  PayloadFileInput,
  PayloadToc
} from "../format/types.js";
import {
  getCompressionCodec,
  validateCompressionCodecs,
  validateCompressionName
} from "./compression.js";
import { sha256Hex } from "./hash.js";
import { crc32 } from "./hash.js";
import { writePayloadFooter, writePayloadHeader } from "./layout.js";

const MANIFEST_CHUNK_NAME = "manifest.json";

const textEncoder = new TextEncoder();

interface PreparedChunk {
  readonly input: PayloadFileInput;
  readonly bytes: Uint8Array;
}

interface StoredChunk {
  readonly input: PayloadFileInput;
  readonly logicalBytes: Uint8Array;
  readonly storedBytes: Uint8Array;
  readonly compression: CompressionAlgorithm;
}

export async function createPayload(options: CreatePayloadOptions): Promise<Uint8Array> {
  validateIntegrityOption(options.integrity);
  validateChunkOrder(options.chunkOrder);
  validateCompressionName(options.compression ?? DEFAULT_COMPRESSION);
  validateCompressionCodecs(options.compressionCodecs);

  const chunks = prepareChunks(options);
  const chunkRecords: PayloadChunkRecord[] = [];
  const chunkBytes: Uint8Array[] = [];
  let offset = PAYLOAD_HEADER_LENGTH;

  for (const chunk of chunks) {
    const compression = chunk.input.compression ?? options.compression ?? DEFAULT_COMPRESSION;
    const compressionMode = chunk.input.compressionMode ?? options.compressionMode ?? "smaller";
    validateCompressionName(compression);
    validateCompressionMode(compressionMode);

    const storedChunk = await prepareStoredChunk(
      chunk,
      compression,
      compressionMode,
      options.compressionCodecs
    );
    const record = await createChunkRecord(storedChunk, offset, options.integrity);
    chunkRecords.push(record);
    chunkBytes.push(storedChunk.storedBytes);
    offset += storedChunk.storedBytes.byteLength;
  }

  const toc: PayloadToc = {
    version: PAYLOAD_FORMAT_VERSION,
    tocEncoding: DEFAULT_TOC_ENCODING,
    ...(options.createdBy === undefined ? {} : { createdBy: options.createdBy }),
    ...(options.manifest === undefined ? {} : { manifest: { path: MANIFEST_CHUNK_NAME } }),
    chunks: chunkRecords,
    ...(options.metadata === undefined ? {} : { metadata: options.metadata })
  };

  const tocBytes = textEncoder.encode(JSON.stringify(toc));
  const payloadLength = offset + tocBytes.byteLength + PAYLOAD_FOOTER_LENGTH;
  const footer = writePayloadFooter({
    tocOffset: offset,
    tocLength: tocBytes.byteLength,
    payloadLength,
    footerChecksum: crc32(tocBytes)
  });

  return concatBytes([writePayloadHeader(), ...chunkBytes, tocBytes, footer], payloadLength);
}

function prepareChunks(options: CreatePayloadOptions): PreparedChunk[] {
  const chunks: PreparedChunk[] = [];
  const seenNames = new Set<string>();

  if (options.manifest !== undefined) {
    addChunk(
      chunks,
      seenNames,
      {
        name: MANIFEST_CHUNK_NAME,
        bytes: serializeManifest(options.manifest),
        mime: "application/json",
        encoding: "utf-8",
        compression: DEFAULT_COMPRESSION
      },
      true
    );
  }

  const files =
    options.chunkOrder === "name"
      ? [...options.files].sort((left, right) => left.name.localeCompare(right.name))
      : options.files;

  for (const file of files) {
    addChunk(chunks, seenNames, file, options.manifest !== undefined);
  }

  return chunks;
}

function addChunk(
  chunks: PreparedChunk[],
  seenNames: Set<string>,
  input: PayloadFileInput,
  hasGeneratedManifest: boolean
): void {
  assertValidChunkName(input.name);

  if (hasGeneratedManifest && input.name === MANIFEST_CHUNK_NAME && chunks.length > 0) {
    throw new PayloadFormatError(
      "Cannot pass an explicit manifest.json file when createPayload options include manifest."
    );
  }

  if (seenNames.has(input.name)) {
    throw new PayloadFormatError(`Duplicate ByteDist chunk name: ${input.name}.`);
  }

  seenNames.add(input.name);
  chunks.push({
    input,
    bytes: input.bytes
  });
}

async function createChunkRecord(
  chunk: StoredChunk,
  offset: number,
  integrity: CreatePayloadOptions["integrity"]
): Promise<PayloadChunkRecord> {
  const hash =
    integrity === "sha256"
      ? { algorithm: integrity, value: await sha256Hex(chunk.logicalBytes) }
      : undefined;

  return {
    name: chunk.input.name,
    offset,
    length: chunk.logicalBytes.byteLength,
    storedLength: chunk.storedBytes.byteLength,
    ...(chunk.input.mime === undefined ? {} : { mime: chunk.input.mime }),
    ...(chunk.input.encoding === undefined ? {} : { encoding: chunk.input.encoding }),
    compression: chunk.compression,
    ...(hash === undefined ? {} : { hash }),
    ...(chunk.input.metadata === undefined ? {} : { metadata: chunk.input.metadata })
  };
}

async function prepareStoredChunk(
  chunk: PreparedChunk,
  compression: CompressionAlgorithm,
  compressionMode: CompressionMode,
  codecs: CreatePayloadOptions["compressionCodecs"]
): Promise<StoredChunk> {
  if (compression === DEFAULT_COMPRESSION) {
    return {
      input: chunk.input,
      logicalBytes: chunk.bytes,
      storedBytes: chunk.bytes,
      compression: DEFAULT_COMPRESSION
    };
  }

  const codec = getCompressionCodec(compression, codecs);
  const compressedBytes = await codec.compress(chunk.bytes);
  const shouldStoreCompressed =
    compressionMode === "always" || compressedBytes.byteLength < chunk.bytes.byteLength;

  return {
    input: chunk.input,
    logicalBytes: chunk.bytes,
    storedBytes: shouldStoreCompressed ? compressedBytes : chunk.bytes,
    compression: shouldStoreCompressed ? compression : DEFAULT_COMPRESSION
  };
}

function serializeManifest(manifest: JsonValue): Uint8Array {
  try {
    return textEncoder.encode(JSON.stringify(manifest));
  } catch (error) {
    throw new PayloadFormatError("ByteDist manifest must be JSON-serializable.", { cause: error });
  }
}

function validateIntegrityOption(integrity: CreatePayloadOptions["integrity"]): void {
  if (integrity !== undefined && integrity !== false && integrity !== "sha256") {
    throw new PayloadIntegrityError(
      `Unsupported ByteDist integrity algorithm: ${String(integrity)}.`
    );
  }
}

function validateChunkOrder(order: CreatePayloadOptions["chunkOrder"]): void {
  if (order !== undefined && order !== "input" && order !== "name") {
    throw new PayloadFormatError(`Unsupported ByteDist chunk order: ${String(order)}.`);
  }
}

function validateCompressionMode(mode: unknown): asserts mode is CompressionMode {
  if (mode !== "smaller" && mode !== "always") {
    throw new PayloadCompressionError(`Unsupported ByteDist compression mode: ${String(mode)}.`);
  }
}

function concatBytes(parts: readonly Uint8Array[], totalLength: number): Uint8Array {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}
