import {
  DEFAULT_COMPRESSION,
  DEFAULT_TOC_ENCODING,
  PAYLOAD_FLAGS_NONE,
  PAYLOAD_FOOTER_LENGTH,
  PAYLOAD_FORMAT_VERSION,
  PAYLOAD_HEADER_LENGTH
} from "../format/constants.js";
import {
  ByteDistError,
  PayloadChunkNotFoundError,
  PayloadCompressionError,
  PayloadFormatError,
  PayloadIntegrityError,
  PayloadIntegrityMetadataMissingError,
  PayloadIntegrityMismatchError
} from "../format/errors.js";
import {
  assertFooterMagic,
  assertPayloadMagic,
  assertSupportedFormatVersion,
  assertValidChunkName
} from "../format/validation.js";
import type {
  CompressionAlgorithm,
  JsonObject,
  JsonValue,
  OpenPayloadOptions,
  OpenedPayload,
  PayloadChunkRecord,
  PayloadHash,
  PayloadManifestReference,
  PayloadToc
} from "../format/types.js";
import {
  getCompressionCodec,
  validateCompressionCodecs,
  validateCompressionName
} from "./compression.js";
import { crc32, sha256Hex } from "./hash.js";

const textDecoder = new TextDecoder();

interface HeaderFields {
  readonly formatVersion: typeof PAYLOAD_FORMAT_VERSION;
  readonly headerLength: typeof PAYLOAD_HEADER_LENGTH;
  readonly flags: typeof PAYLOAD_FLAGS_NONE;
}

interface FooterFields {
  readonly formatVersion: typeof PAYLOAD_FORMAT_VERSION;
  readonly tocOffset: number;
  readonly tocLength: number;
  readonly payloadLength: number;
  readonly tocChecksum: number;
}

interface ParsedPayload {
  readonly bytes: Uint8Array;
  readonly header: HeaderFields;
  readonly footer: FooterFields;
  readonly toc: PayloadToc;
  readonly chunksByName: ReadonlyMap<string, PayloadChunkRecord>;
  readonly options: OpenPayloadOptions;
}

export async function openPayload(
  bytes: Uint8Array,
  options: OpenPayloadOptions = {}
): Promise<OpenedPayload> {
  validateCompressionCodecs(options.compressionCodecs);
  const parsed = parsePayload(bytes, options);
  return new InMemoryOpenedPayload(parsed);
}

function parsePayload(bytes: Uint8Array, options: OpenPayloadOptions): ParsedPayload {
  if (bytes.byteLength < PAYLOAD_HEADER_LENGTH + PAYLOAD_FOOTER_LENGTH) {
    throw new PayloadFormatError("ByteDist payload is too short to contain a header and footer.");
  }

  const header = parseHeader(bytes);
  const footer = parseFooter(bytes);
  const toc = parseToc(bytes, footer);
  const chunksByName = validateToc(toc, bytes.byteLength, footer.tocOffset);

  return {
    bytes,
    header,
    footer,
    toc,
    chunksByName,
    options
  };
}

function parseHeader(bytes: Uint8Array): HeaderFields {
  assertPayloadMagic(bytes.slice(0, 8));

  const view = dataView(bytes, 0, PAYLOAD_HEADER_LENGTH);
  const version = view.getUint32(8, true);
  assertSupportedFormatVersion(version);

  const headerLength = view.getUint32(12, true);
  if (headerLength !== PAYLOAD_HEADER_LENGTH) {
    throw new PayloadFormatError(`Invalid ByteDist header length: ${headerLength}.`);
  }

  const flags = view.getUint32(16, true);
  if (flags !== PAYLOAD_FLAGS_NONE) {
    throw new PayloadFormatError(`Unsupported ByteDist payload flags: ${flags}.`);
  }

  const reserved = view.getUint32(20, true);
  if (reserved !== 0) {
    throw new PayloadFormatError(`Invalid ByteDist reserved header field: ${reserved}.`);
  }

  return {
    formatVersion: PAYLOAD_FORMAT_VERSION,
    headerLength: PAYLOAD_HEADER_LENGTH,
    flags: PAYLOAD_FLAGS_NONE
  };
}

function parseFooter(bytes: Uint8Array): FooterFields {
  const footerOffset = bytes.byteLength - PAYLOAD_FOOTER_LENGTH;
  assertFooterMagic(bytes.slice(footerOffset, footerOffset + 8));

  const view = dataView(bytes, footerOffset, PAYLOAD_FOOTER_LENGTH);
  const version = view.getUint32(8, true);
  assertSupportedFormatVersion(version);

  const tocOffset = readU64(view, 12, "TOC offset");
  const tocLength = readU64(view, 20, "TOC length");
  const payloadLength = readU64(view, 28, "payload length");
  const checksum = view.getUint32(36, true);

  if (payloadLength !== bytes.byteLength) {
    throw new PayloadFormatError(
      `ByteDist footer payload length ${payloadLength} does not match actual length ${bytes.byteLength}.`
    );
  }

  if (tocOffset < PAYLOAD_HEADER_LENGTH) {
    throw new PayloadFormatError(`Invalid ByteDist TOC offset: ${tocOffset}.`);
  }

  if (tocLength <= 0) {
    throw new PayloadFormatError(`Invalid ByteDist TOC length: ${tocLength}.`);
  }

  const tocEnd = tocOffset + tocLength;
  if (!Number.isSafeInteger(tocEnd) || tocEnd > footerOffset) {
    throw new PayloadFormatError("ByteDist TOC range is outside the payload data region.");
  }

  return {
    formatVersion: PAYLOAD_FORMAT_VERSION,
    tocOffset,
    tocLength,
    payloadLength,
    tocChecksum: checksum
  };
}

function parseToc(bytes: Uint8Array, footer: FooterFields): PayloadToc {
  const tocBytes = bytes.slice(footer.tocOffset, footer.tocOffset + footer.tocLength);
  const actualChecksum = crc32(tocBytes);

  if (actualChecksum !== footer.tocChecksum) {
    throw new PayloadIntegrityError(
      `ByteDist TOC CRC32 mismatch: expected ${footer.tocChecksum}, got ${actualChecksum}.`
    );
  }

  try {
    const parsed = JSON.parse(textDecoder.decode(tocBytes));
    return coerceToc(parsed);
  } catch (error) {
    if (error instanceof ByteDistError) {
      throw error;
    }

    throw new PayloadFormatError("ByteDist TOC is not valid JSON.", { cause: error });
  }
}

function coerceToc(value: unknown): PayloadToc {
  const toc = expectObject(value, "ByteDist TOC");

  if (toc["version"] !== PAYLOAD_FORMAT_VERSION) {
    throw new PayloadFormatError("ByteDist TOC has an unsupported version.");
  }

  if (toc["tocEncoding"] !== DEFAULT_TOC_ENCODING) {
    throw new PayloadFormatError("ByteDist TOC has an unsupported encoding.");
  }

  const chunks = toc["chunks"];
  if (!Array.isArray(chunks)) {
    throw new PayloadFormatError("ByteDist TOC chunks must be an array.");
  }

  return {
    version: PAYLOAD_FORMAT_VERSION,
    tocEncoding: DEFAULT_TOC_ENCODING,
    ...(typeof toc["createdBy"] === "string" ? { createdBy: toc["createdBy"] } : {}),
    ...(isManifestReference(toc["manifest"]) ? { manifest: toc["manifest"] } : {}),
    chunks: chunks.map((chunk, index) => coerceChunkRecord(chunk, index)),
    ...(isJsonObject(toc["metadata"]) ? { metadata: toc["metadata"] } : {})
  };
}

function coerceChunkRecord(value: unknown, index: number): PayloadChunkRecord {
  const chunk = expectObject(value, `ByteDist TOC chunk at index ${index}`);
  const name = chunk["name"];
  const offset = chunk["offset"];
  const length = chunk["length"];
  const storedLength = chunk["storedLength"];

  if (typeof name !== "string") {
    throw new PayloadFormatError(`ByteDist TOC chunk at index ${index} has an invalid name.`);
  }

  if (!isSafeNonNegativeInteger(offset)) {
    throw new PayloadFormatError(`ByteDist TOC chunk ${name} has an invalid offset.`);
  }

  if (!isSafeNonNegativeInteger(length)) {
    throw new PayloadFormatError(`ByteDist TOC chunk ${name} has an invalid length.`);
  }

  if (!isSafeNonNegativeInteger(storedLength)) {
    throw new PayloadFormatError(`ByteDist TOC chunk ${name} has an invalid stored length.`);
  }

  const compression = chunk["compression"];
  validateCompressionName(compression);

  const hash = coerceHash(chunk["hash"], name);

  return {
    name,
    offset,
    length,
    storedLength,
    ...(typeof chunk["mime"] === "string" ? { mime: chunk["mime"] } : {}),
    ...(typeof chunk["encoding"] === "string" ? { encoding: chunk["encoding"] } : {}),
    compression,
    ...(hash === undefined ? {} : { hash }),
    ...(isJsonObject(chunk["metadata"]) ? { metadata: chunk["metadata"] } : {})
  };
}

function validateToc(
  toc: PayloadToc,
  payloadLength: number,
  tocOffset: number
): ReadonlyMap<string, PayloadChunkRecord> {
  const chunksByName = new Map<string, PayloadChunkRecord>();

  for (const chunk of toc.chunks) {
    assertValidChunkName(chunk.name);

    if (chunksByName.has(chunk.name)) {
      throw new PayloadFormatError(`Duplicate ByteDist chunk name in TOC: ${chunk.name}.`);
    }

    if (chunk.compression === DEFAULT_COMPRESSION && chunk.storedLength !== chunk.length) {
      throw new PayloadCompressionError(
        `ByteDist chunk ${chunk.name} has different stored and logical lengths without compression.`
      );
    }

    const chunkEnd = chunk.offset + chunk.storedLength;
    if (
      !Number.isSafeInteger(chunkEnd) ||
      chunk.offset < PAYLOAD_HEADER_LENGTH ||
      chunkEnd > tocOffset
    ) {
      throw new PayloadFormatError(
        `ByteDist chunk ${chunk.name} points outside the chunk data region.`
      );
    }

    if (tocOffset > payloadLength - PAYLOAD_FOOTER_LENGTH) {
      throw new PayloadFormatError("ByteDist TOC starts after the chunk data region.");
    }

    chunksByName.set(chunk.name, chunk);
  }

  return chunksByName;
}

class InMemoryOpenedPayload implements OpenedPayload {
  public readonly formatVersion = PAYLOAD_FORMAT_VERSION;

  readonly #bytes: Uint8Array;
  readonly #toc: PayloadToc;
  readonly #chunksByName: ReadonlyMap<string, PayloadChunkRecord>;
  readonly #options: OpenPayloadOptions;

  public constructor(parsed: ParsedPayload) {
    this.#bytes = parsed.bytes;
    this.#toc = parsed.toc;
    this.#chunksByName = parsed.chunksByName;
    this.#options = parsed.options;
    void parsed.header;
    void parsed.footer;
  }

  public getToc(): PayloadToc {
    return structuredClone(this.#toc);
  }

  public list(): readonly string[] {
    return this.#toc.chunks.map((chunk) => chunk.name);
  }

  public has(name: string): boolean {
    return this.#chunksByName.has(name);
  }

  public async readBytes(name: string): Promise<Uint8Array> {
    const chunk = this.#chunksByName.get(name);
    if (!chunk) {
      throw new PayloadChunkNotFoundError(name);
    }

    return this.readChunkBytes(chunk);
  }

  public async readText(name: string): Promise<string> {
    return textDecoder.decode(await this.readBytes(name));
  }

  public async readJson<T extends JsonValue = JsonValue>(name: string): Promise<T> {
    const text = await this.readText(name);

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new PayloadFormatError(`ByteDist chunk ${name} does not contain valid JSON.`, {
        cause: error
      });
    }
  }

  public async verify(): Promise<void> {
    for (const chunk of this.#toc.chunks) {
      if (!chunk.hash) {
        throw new PayloadIntegrityMetadataMissingError(
          `ByteDist chunk ${chunk.name} has no integrity metadata.`,
          { chunkName: chunk.name }
        );
      }

      const bytes = await this.readChunkBytes(chunk);
      const actualHash = await sha256Hex(bytes);

      if (actualHash !== chunk.hash.value) {
        throw new PayloadIntegrityMismatchError(
          `ByteDist chunk ${chunk.name} failed integrity verification.`,
          { chunkName: chunk.name }
        );
      }
    }
  }

  public close(): void {
    // In-memory payloads do not own external resources.
  }

  private async readChunkBytes(chunk: PayloadChunkRecord): Promise<Uint8Array> {
    const storedBytes = this.#bytes.slice(chunk.offset, chunk.offset + chunk.storedLength);

    if (chunk.compression === DEFAULT_COMPRESSION) {
      return storedBytes;
    }

    const codec = getCompressionCodec(chunk.compression, this.#options.compressionCodecs);
    const logicalBytes = await codec.decompress(storedBytes);

    if (logicalBytes.byteLength !== chunk.length) {
      throw new PayloadCompressionError(
        `ByteDist chunk ${chunk.name} decompressed to ${logicalBytes.byteLength} bytes, expected ${chunk.length}.`
      );
    }

    return logicalBytes.slice();
  }
}

function dataView(bytes: Uint8Array, byteOffset: number, byteLength: number): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset + byteOffset, byteLength);
}

function readU64(view: DataView, byteOffset: number, label: string): number {
  const value = Number(view.getBigUint64(byteOffset, true));
  if (!Number.isSafeInteger(value)) {
    throw new PayloadFormatError(`ByteDist ${label} is outside the safe integer range.`);
  }

  return value;
}

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PayloadFormatError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isManifestReference(value: unknown): value is PayloadManifestReference {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)["path"] === "string"
  );
}

function coerceHash(value: unknown, name: string): PayloadHash | undefined {
  if (value === undefined) {
    return undefined;
  }

  const hash = expectObject(value, `ByteDist TOC chunk ${name} hash`);
  if (hash["algorithm"] !== "sha256" || typeof hash["value"] !== "string") {
    throw new PayloadFormatError(`ByteDist TOC chunk ${name} has invalid hash metadata.`);
  }

  return {
    algorithm: "sha256",
    value: hash["value"]
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}
