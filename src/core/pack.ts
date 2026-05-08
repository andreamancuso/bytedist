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
  CreatePayloadOptions,
  JsonValue,
  PayloadChunkRecord,
  PayloadFileInput,
  PayloadToc
} from "../format/types.js";
import { sha256Hex } from "./hash.js";
import { writePayloadFooter, writePayloadHeader } from "./layout.js";

const MANIFEST_CHUNK_NAME = "manifest.json";

const textEncoder = new TextEncoder();

interface PreparedChunk {
  readonly input: PayloadFileInput;
  readonly bytes: Uint8Array;
}

export async function createPayload(options: CreatePayloadOptions): Promise<Uint8Array> {
  validateIntegrityOption(options.integrity);
  validateCompressionOption(options.compression ?? DEFAULT_COMPRESSION);

  const chunks = prepareChunks(options);
  const chunkRecords: PayloadChunkRecord[] = [];
  const chunkBytes: Uint8Array[] = [];
  let offset = PAYLOAD_HEADER_LENGTH;

  for (const chunk of chunks) {
    const compression = chunk.input.compression ?? options.compression ?? DEFAULT_COMPRESSION;
    validateCompressionOption(compression);

    const record = await createChunkRecord(chunk, offset, compression, options.integrity);
    chunkRecords.push(record);
    chunkBytes.push(chunk.bytes);
    offset += chunk.bytes.byteLength;
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
    payloadLength
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

  for (const file of options.files) {
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
  chunk: PreparedChunk,
  offset: number,
  compression: CompressionAlgorithm,
  integrity: CreatePayloadOptions["integrity"]
): Promise<PayloadChunkRecord> {
  const hash =
    integrity === "sha256"
      ? { algorithm: integrity, value: await sha256Hex(chunk.bytes) }
      : undefined;

  return {
    name: chunk.input.name,
    offset,
    length: chunk.bytes.byteLength,
    storedLength: chunk.bytes.byteLength,
    ...(chunk.input.mime === undefined ? {} : { mime: chunk.input.mime }),
    ...(chunk.input.encoding === undefined ? {} : { encoding: chunk.input.encoding }),
    compression,
    ...(hash === undefined ? {} : { hash }),
    ...(chunk.input.metadata === undefined ? {} : { metadata: chunk.input.metadata })
  };
}

function serializeManifest(manifest: JsonValue): Uint8Array {
  try {
    return textEncoder.encode(JSON.stringify(manifest));
  } catch (error) {
    throw new PayloadFormatError("ByteDist manifest must be JSON-serializable.", { cause: error });
  }
}

function validateCompressionOption(
  compression: unknown
): asserts compression is CompressionAlgorithm {
  if (compression !== DEFAULT_COMPRESSION) {
    throw new PayloadCompressionError(
      `Unsupported ByteDist compression algorithm: ${String(compression)}.`
    );
  }
}

function validateIntegrityOption(integrity: CreatePayloadOptions["integrity"]): void {
  if (integrity !== undefined && integrity !== false && integrity !== "sha256") {
    throw new PayloadIntegrityError(
      `Unsupported ByteDist integrity algorithm: ${String(integrity)}.`
    );
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
