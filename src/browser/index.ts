import {
  getCompressionCodec,
  validateCompressionCodecs,
  validateCompressionName
} from "../core/compression.js";
import { crc32, sha256Hex } from "../core/hash.js";
import { openPayload } from "../core/index.js";
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
  PayloadEmbeddingError,
  PayloadFormatError,
  PayloadIntegrityError,
  PayloadIntegrityMetadataMissingError,
  PayloadIntegrityMismatchError,
  PayloadLoadError
} from "../format/errors.js";
import type {
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
  assertFooterMagic,
  assertPayloadMagic,
  assertSupportedFormatVersion,
  assertValidChunkName
} from "../format/validation.js";
import { EMBEDDED_PAYLOAD_SELECTOR, EMBEDDED_WASM_SELECTOR, decodeBase64 } from "../html/index.js";

const textDecoder = new TextDecoder();

export interface LoadPayloadFromUrlOptions extends OpenPayloadOptions {
  readonly fetch?: typeof fetch;
  readonly requestInit?: RequestInit;
}

export type RangePayloadCacheMode = "none" | "bytes";

export interface OpenPayloadFromUrlRangeOptions extends LoadPayloadFromUrlOptions {
  readonly cache?: RangePayloadCacheMode;
}

export interface ReadChunkAsBlobOptions {
  readonly mime?: string;
}

export interface ChunkObjectUrl {
  readonly url: string;
  readonly blob: Blob;
  revoke(): void;
}

export interface CreateChunkObjectUrlOptions extends ReadChunkAsBlobOptions {
  readonly urlFactory?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
}

export interface ReadEmbeddedPayloadOptions {
  readonly selector?: string;
  readonly document?: Pick<Document, "querySelector">;
}

export interface OpenEmbeddedPayloadOptions
  extends ReadEmbeddedPayloadOptions, OpenPayloadOptions {}

export interface ReadEmbeddedWasmOptions {
  readonly selector?: string;
  readonly document?: Pick<Document, "querySelector">;
}

export async function loadPayloadFromUrl(
  input: RequestInfo | URL,
  options: LoadPayloadFromUrlOptions = {}
): Promise<OpenedPayload> {
  const fetcher = options.fetch ?? globalThis.fetch;

  if (typeof fetcher !== "function") {
    throw new PayloadLoadError("Fetch is unavailable in this runtime.");
  }

  let response: Response;
  try {
    response = await fetcher(input, options.requestInit);
  } catch (error) {
    throw new PayloadLoadError("Failed to fetch ByteDist payload.", { cause: error });
  }

  if (!response.ok) {
    throw new PayloadLoadError(
      `Failed to fetch ByteDist payload: HTTP ${response.status} ${response.statusText}.`
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (error) {
    throw new PayloadLoadError("Failed to read fetched ByteDist payload bytes.", { cause: error });
  }

  return openPayload(new Uint8Array(buffer), options);
}

export async function openPayloadFromUrlRange(
  input: RequestInfo | URL,
  options: OpenPayloadFromUrlRangeOptions = {}
): Promise<OpenedPayload> {
  validateCompressionCodecs(options.compressionCodecs);

  const loader = new HttpRangePayloadLoader(input, options);
  const footerResponse = await loader.fetchRange({
    range: `bytes=-${PAYLOAD_FOOTER_LENGTH}`,
    label: "footer",
    allowFullFallback: true
  });

  if (footerResponse.fullPayload !== undefined) {
    return openPayload(footerResponse.fullPayload, options);
  }

  const footerRange = footerResponse.contentRange;
  if (footerRange === undefined) {
    throw new PayloadLoadError("ByteDist range response is missing Content-Range.");
  }

  if (
    footerResponse.bytes.byteLength !== PAYLOAD_FOOTER_LENGTH ||
    footerRange.end - footerRange.start + 1 !== PAYLOAD_FOOTER_LENGTH
  ) {
    throw new PayloadLoadError("ByteDist footer range response has an invalid length.");
  }

  const footer = parseRangeFooter(footerResponse.bytes, footerRange.total);
  const headerBytes = await loader.fetchRequiredRange(0, PAYLOAD_HEADER_LENGTH - 1, "header");
  parseRangeHeader(headerBytes);

  const tocBytes = await loader.fetchRequiredRange(
    footer.tocOffset,
    footer.tocOffset + footer.tocLength - 1,
    "TOC"
  );
  const toc = parseRangeToc(tocBytes, footer.tocChecksum);
  const chunksByName = validateRangeToc(toc, footer.payloadLength, footer.tocOffset);

  return new HttpRangeOpenedPayload({
    loader,
    toc,
    chunksByName,
    options
  });
}

export async function loadPayloadFromBlob(
  blob: Blob,
  options: OpenPayloadOptions = {}
): Promise<OpenedPayload> {
  let buffer: ArrayBuffer;
  try {
    buffer = await blob.arrayBuffer();
  } catch (error) {
    throw new PayloadLoadError("Failed to read ByteDist payload from Blob.", { cause: error });
  }

  return openPayload(new Uint8Array(buffer), options);
}

export async function loadPayloadFromFile(
  file: File,
  options: OpenPayloadOptions = {}
): Promise<OpenedPayload> {
  return loadPayloadFromBlob(file, options);
}

export function readEmbeddedPayload(options: ReadEmbeddedPayloadOptions = {}): Uint8Array {
  return readEmbeddedBytes({
    selector: options.selector ?? EMBEDDED_PAYLOAD_SELECTOR,
    document: options.document,
    label: "payload"
  });
}

export function readEmbeddedWasm(options: ReadEmbeddedWasmOptions = {}): Uint8Array {
  return readEmbeddedBytes({
    selector: options.selector ?? EMBEDDED_WASM_SELECTOR,
    document: options.document,
    label: "WASM"
  });
}

function readEmbeddedBytes(options: {
  readonly selector: string;
  readonly document: Pick<Document, "querySelector"> | undefined;
  readonly label: string;
}): Uint8Array {
  const documentRef = options.document ?? globalThis.document;

  if (documentRef === undefined) {
    throw new PayloadEmbeddingError("Document is unavailable in this runtime.");
  }

  const element = documentRef.querySelector(options.selector);

  if (element === null) {
    throw new PayloadEmbeddingError(
      `Embedded ByteDist ${options.label} element not found: ${options.selector}`
    );
  }

  return decodeBase64(element.textContent ?? "");
}

export async function openEmbeddedPayload(
  options: OpenEmbeddedPayloadOptions = {}
): Promise<OpenedPayload> {
  return openPayload(readEmbeddedPayload(options), options);
}

export async function readChunkAsBlob(
  archive: OpenedPayload,
  name: string,
  options: ReadChunkAsBlobOptions = {}
): Promise<Blob> {
  const bytes = await archive.readBytes(name);
  const mime = options.mime ?? archive.getToc().chunks.find((chunk) => chunk.name === name)?.mime;

  return new Blob([toArrayBuffer(bytes)], mime === undefined ? {} : { type: mime });
}

export async function createChunkObjectUrl(
  archive: OpenedPayload,
  name: string,
  options: CreateChunkObjectUrlOptions = {}
): Promise<ChunkObjectUrl> {
  const urlFactory = options.urlFactory ?? URL;
  const blob = await readChunkAsBlob(archive, name, options);
  const url = urlFactory.createObjectURL(blob);
  let revoked = false;

  return {
    url,
    blob,
    revoke(): void {
      if (revoked) {
        return;
      }

      revoked = true;
      urlFactory.revokeObjectURL(url);
    }
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

interface RangeFooterFields {
  readonly tocOffset: number;
  readonly tocLength: number;
  readonly payloadLength: number;
  readonly tocChecksum: number;
}

interface ContentRange {
  readonly start: number;
  readonly end: number;
  readonly total: number;
}

interface RangeFetchResult {
  readonly bytes: Uint8Array;
  readonly contentRange?: ContentRange;
  readonly fullPayload?: Uint8Array;
}

class HttpRangePayloadLoader {
  readonly #input: RequestInfo | URL;
  readonly #fetcher: typeof fetch;
  readonly #requestInit: RequestInit | undefined;

  public constructor(input: RequestInfo | URL, options: OpenPayloadFromUrlRangeOptions) {
    this.#input = input;
    this.#fetcher = options.fetch ?? globalThis.fetch;
    this.#requestInit = options.requestInit;

    if (typeof this.#fetcher !== "function") {
      throw new PayloadLoadError("Fetch is unavailable in this runtime.");
    }
  }

  public async fetchRequiredRange(start: number, end: number, label: string): Promise<Uint8Array> {
    const result = await this.fetchRange({
      range: `bytes=${start}-${end}`,
      label,
      allowFullFallback: false
    });

    if (result.contentRange === undefined) {
      throw new PayloadLoadError(`ByteDist ${label} range response is missing Content-Range.`);
    }

    if (result.contentRange.start !== start || result.contentRange.end !== end) {
      throw new PayloadLoadError(
        `ByteDist ${label} range response does not match the requested range.`
      );
    }

    if (result.bytes.byteLength !== end - start + 1) {
      throw new PayloadLoadError(`ByteDist ${label} range response has an invalid length.`);
    }

    return result.bytes;
  }

  public async fetchRange(options: {
    readonly range: string;
    readonly label: string;
    readonly allowFullFallback: boolean;
  }): Promise<RangeFetchResult> {
    let response: Response;

    try {
      response = await this.#fetcher(
        this.#input,
        withRangeHeader(this.#requestInit, options.range)
      );
    } catch (error) {
      throw new PayloadLoadError(`Failed to fetch ByteDist ${options.label} range.`, {
        cause: error
      });
    }

    if (options.allowFullFallback && response.status === 200) {
      return {
        bytes: new Uint8Array(),
        fullPayload: await readResponseBytes(response, "full ByteDist payload")
      };
    }

    if (response.status !== 206) {
      throw new PayloadLoadError(
        `Failed to fetch ByteDist ${options.label} range: HTTP ${response.status} ${response.statusText}.`
      );
    }

    const bytes = await readResponseBytes(response, `ByteDist ${options.label} range`);
    const contentRange = parseContentRange(response.headers.get("Content-Range"));

    return contentRange === undefined ? { bytes } : { bytes, contentRange };
  }
}

class HttpRangeOpenedPayload implements OpenedPayload {
  public readonly formatVersion = PAYLOAD_FORMAT_VERSION;

  readonly #loader: HttpRangePayloadLoader;
  readonly #toc: PayloadToc;
  readonly #chunksByName: ReadonlyMap<string, PayloadChunkRecord>;
  readonly #options: OpenPayloadFromUrlRangeOptions;
  readonly #cache = new Map<string, Uint8Array>();
  #closed = false;

  public constructor(parsed: {
    readonly loader: HttpRangePayloadLoader;
    readonly toc: PayloadToc;
    readonly chunksByName: ReadonlyMap<string, PayloadChunkRecord>;
    readonly options: OpenPayloadFromUrlRangeOptions;
  }) {
    this.#loader = parsed.loader;
    this.#toc = parsed.toc;
    this.#chunksByName = parsed.chunksByName;
    this.#options = parsed.options;
  }

  public getToc(): PayloadToc {
    this.assertOpen();
    return structuredClone(this.#toc);
  }

  public list(): readonly string[] {
    this.assertOpen();
    return this.#toc.chunks.map((chunk) => chunk.name);
  }

  public has(name: string): boolean {
    this.assertOpen();
    return this.#chunksByName.has(name);
  }

  public async readBytes(name: string): Promise<Uint8Array> {
    this.assertOpen();

    const cached = this.#cache.get(name);
    if (cached !== undefined) {
      return cached.slice();
    }

    const chunk = this.#chunksByName.get(name);
    if (chunk === undefined) {
      throw new PayloadChunkNotFoundError(name);
    }

    const bytes = await this.readChunkBytes(chunk);
    if (this.#options.cache === "bytes") {
      this.#cache.set(name, bytes.slice());
    }

    return bytes;
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
    this.assertOpen();

    for (const chunk of this.#toc.chunks) {
      if (!chunk.hash) {
        throw new PayloadIntegrityMetadataMissingError(
          `ByteDist chunk ${chunk.name} has no integrity metadata.`,
          { chunkName: chunk.name }
        );
      }

      const actualHash = await sha256Hex(await this.readBytes(chunk.name));
      if (actualHash !== chunk.hash.value) {
        throw new PayloadIntegrityMismatchError(
          `ByteDist chunk ${chunk.name} failed integrity verification.`,
          { chunkName: chunk.name }
        );
      }
    }
  }

  public close(): void {
    this.#cache.clear();
    this.#closed = true;
  }

  private async readChunkBytes(chunk: PayloadChunkRecord): Promise<Uint8Array> {
    if (chunk.storedLength === 0) {
      return new Uint8Array();
    }

    const storedBytes = await this.#loader.fetchRequiredRange(
      chunk.offset,
      chunk.offset + chunk.storedLength - 1,
      `chunk ${chunk.name}`
    );

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

  private assertOpen(): void {
    if (this.#closed) {
      throw new PayloadFormatError("ByteDist range payload is closed.");
    }
  }
}

async function readResponseBytes(response: Response, label: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new PayloadLoadError(`Failed to read ${label} bytes.`, { cause: error });
  }
}

function withRangeHeader(init: RequestInit | undefined, range: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("Range", range);

  return {
    ...(init ?? {}),
    headers
  };
}

function parseContentRange(value: string | null): ContentRange | undefined {
  if (value === null) {
    return undefined;
  }

  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value);
  if (match === null) {
    throw new PayloadLoadError(`Invalid ByteDist Content-Range header: ${value}.`);
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    end < start ||
    total <= end
  ) {
    throw new PayloadLoadError(`Invalid ByteDist Content-Range header: ${value}.`);
  }

  return { start, end, total };
}

function parseRangeHeader(bytes: Uint8Array): void {
  if (bytes.byteLength !== PAYLOAD_HEADER_LENGTH) {
    throw new PayloadFormatError("Invalid ByteDist header range length.");
  }

  assertPayloadMagic(bytes.slice(0, 8));

  const view = dataView(bytes, 0, PAYLOAD_HEADER_LENGTH);
  assertSupportedFormatVersion(view.getUint32(8, true));

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
}

function parseRangeFooter(bytes: Uint8Array, actualPayloadLength: number): RangeFooterFields {
  assertFooterMagic(bytes.slice(0, 8));

  const view = dataView(bytes, 0, PAYLOAD_FOOTER_LENGTH);
  assertSupportedFormatVersion(view.getUint32(8, true));

  const tocOffset = readU64(view, 12, "TOC offset");
  const tocLength = readU64(view, 20, "TOC length");
  const payloadLength = readU64(view, 28, "payload length");
  const tocChecksum = view.getUint32(36, true);

  if (payloadLength !== actualPayloadLength) {
    throw new PayloadFormatError(
      `ByteDist footer payload length ${payloadLength} does not match actual length ${actualPayloadLength}.`
    );
  }

  if (tocOffset < PAYLOAD_HEADER_LENGTH) {
    throw new PayloadFormatError(`Invalid ByteDist TOC offset: ${tocOffset}.`);
  }

  if (tocLength <= 0) {
    throw new PayloadFormatError(`Invalid ByteDist TOC length: ${tocLength}.`);
  }

  const tocEnd = tocOffset + tocLength;
  if (!Number.isSafeInteger(tocEnd) || tocEnd > payloadLength - PAYLOAD_FOOTER_LENGTH) {
    throw new PayloadFormatError("ByteDist TOC range is outside the payload data region.");
  }

  return {
    tocOffset,
    tocLength,
    payloadLength,
    tocChecksum
  };
}

function parseRangeToc(tocBytes: Uint8Array, expectedChecksum: number): PayloadToc {
  const actualChecksum = crc32(tocBytes);
  if (actualChecksum !== expectedChecksum) {
    throw new PayloadIntegrityError(
      `ByteDist TOC CRC32 mismatch: expected ${expectedChecksum}, got ${actualChecksum}.`
    );
  }

  try {
    return coerceToc(JSON.parse(textDecoder.decode(tocBytes)));
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

function validateRangeToc(
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

function dataView(bytes: Uint8Array, byteOffset: number, byteLength: number): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset + byteOffset, byteLength);
}
