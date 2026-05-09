import { readEmbeddedPayload, readEmbeddedWasm } from "../browser/index.js";
import { PAYLOAD_FORMAT_VERSION } from "../format/constants.js";
import {
  PayloadChunkNotFoundError,
  PayloadCompressionError,
  PayloadFormatError,
  PayloadIntegrityError,
  PayloadIntegrityMetadataMissingError,
  PayloadIntegrityMismatchError,
  PayloadVersionError
} from "../format/errors.js";
import type { JsonValue, OpenPayloadOptions, OpenedPayload, PayloadToc } from "../format/types.js";
import { sha256Hex } from "../core/hash.js";
import { openPayload } from "../core/index.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface ByteDistWasmModuleOptions {
  readonly wasmBinary?: Uint8Array;
  readonly locateFile?: (path: string, prefix: string) => string;
  readonly print?: (text: string) => void;
  readonly printErr?: (text: string) => void;
}

export interface ByteDistWasmModule {
  readonly HEAPU8: Uint8Array;
  _bd_malloc(length: number): number;
  _bd_free(pointer: number): void;
  _bd_open(pointer: number, length: number): number;
  _bd_close(handle: number): void;
  _bd_chunk_count(handle: number): number;
  _bd_toc_json_ptr(handle: number): number;
  _bd_toc_json_len(handle: number): number;
  _bd_chunk_name_ptr(handle: number, index: number): number;
  _bd_chunk_name_len(handle: number, index: number): number;
  _bd_read_chunk(handle: number, namePointer: number, nameLength: number): number;
  _bd_result_ptr(handle: number): number;
  _bd_result_len(handle: number): number;
  _bd_last_error_code(): number;
  _bd_last_error_message_ptr(): number;
  _bd_last_error_message_len(): number;
}

export type ByteDistWasmModuleFactory = (
  options?: ByteDistWasmModuleOptions
) => Promise<ByteDistWasmModule>;

export interface CreateWasmReaderOptions {
  readonly moduleFactory: ByteDistWasmModuleFactory;
  readonly wasmBytes?: Uint8Array;
}

export interface ByteDistWasmReader {
  openPayload(bytes: Uint8Array, options?: OpenPayloadOptions): Promise<OpenedPayload>;
}

export interface OpenPayloadWithWasmOptions extends CreateWasmReaderOptions, OpenPayloadOptions {
  readonly fallback?: "typescript";
}

export interface ReadEmbeddedWasmReaderOptions extends CreateWasmReaderOptions {
  readonly wasmSelector?: string;
  readonly document?: Pick<Document, "querySelector">;
}

export interface OpenEmbeddedPayloadWithWasmOptions extends OpenPayloadWithWasmOptions {
  readonly payloadSelector?: string;
  readonly wasmSelector?: string;
  readonly document?: Pick<Document, "querySelector">;
}

export async function createWasmReader(
  options: CreateWasmReaderOptions
): Promise<ByteDistWasmReader> {
  const module = await options.moduleFactory(
    options.wasmBytes === undefined ? undefined : { wasmBinary: options.wasmBytes }
  );

  return new EmscriptenWasmReader(module);
}

export async function readEmbeddedWasmReader(
  options: ReadEmbeddedWasmReaderOptions
): Promise<ByteDistWasmReader> {
  return createWasmReader({
    moduleFactory: options.moduleFactory,
    wasmBytes:
      options.wasmBytes ??
      readEmbeddedWasm(embeddedReadOptions(options.wasmSelector, options.document))
  });
}

export async function openPayloadWithWasm(
  bytes: Uint8Array,
  options: OpenPayloadWithWasmOptions
): Promise<OpenedPayload> {
  try {
    const reader = await createWasmReader(options);
    return await reader.openPayload(bytes, options);
  } catch (error) {
    if (options.fallback === "typescript") {
      return openPayload(bytes, fallbackOpenOptions(options));
    }

    throw error;
  }
}

export async function openEmbeddedPayloadWithWasm(
  options: OpenEmbeddedPayloadWithWasmOptions
): Promise<OpenedPayload> {
  const payloadBytes = readEmbeddedPayload(
    embeddedReadOptions(options.payloadSelector, options.document)
  );

  try {
    return await openPayloadWithWasm(payloadBytes, {
      ...options,
      wasmBytes:
        options.wasmBytes ??
        readEmbeddedWasm(embeddedReadOptions(options.wasmSelector, options.document))
    });
  } catch (error) {
    if (options.fallback === "typescript") {
      return openPayload(payloadBytes, fallbackOpenOptions(options));
    }

    throw error;
  }
}

function embeddedReadOptions(
  selector: string | undefined,
  document: Pick<Document, "querySelector"> | undefined
): { readonly selector?: string; readonly document?: Pick<Document, "querySelector"> } {
  return {
    ...(selector === undefined ? {} : { selector }),
    ...(document === undefined ? {} : { document })
  };
}

function fallbackOpenOptions(options: OpenPayloadOptions): OpenPayloadOptions {
  return {
    ...(options.compressionCodecs === undefined
      ? {}
      : { compressionCodecs: options.compressionCodecs })
  };
}

class EmscriptenWasmReader implements ByteDistWasmReader {
  readonly #module: ByteDistWasmModule;

  public constructor(module: ByteDistWasmModule) {
    this.#module = module;
  }

  public async openPayload(bytes: Uint8Array): Promise<OpenedPayload> {
    const pointer = copyToWasm(this.#module, bytes);

    try {
      const handle = this.#module._bd_open(pointer, bytes.byteLength);
      if (handle === 0) {
        throw readWasmError(this.#module);
      }

      return new WasmOpenedPayload(this.#module, handle);
    } finally {
      this.#module._bd_free(pointer);
    }
  }
}

class WasmOpenedPayload implements OpenedPayload {
  public readonly formatVersion = PAYLOAD_FORMAT_VERSION;

  readonly #module: ByteDistWasmModule;
  readonly #handle: number;
  readonly #toc: PayloadToc;
  readonly #chunkNames: readonly string[];
  #closed = false;

  public constructor(module: ByteDistWasmModule, handle: number) {
    this.#module = module;
    this.#handle = handle;
    this.#toc = readToc(module, handle);
    this.#chunkNames = listChunkNames(module, handle);
  }

  public getToc(): PayloadToc {
    this.assertOpen();
    return structuredClone(this.#toc);
  }

  public list(): readonly string[] {
    this.assertOpen();
    return [...this.#chunkNames];
  }

  public has(name: string): boolean {
    this.assertOpen();
    return this.#chunkNames.includes(name);
  }

  public async readBytes(name: string): Promise<Uint8Array> {
    this.assertOpen();
    return readChunkBytes(this.#module, this.#handle, name);
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

      const bytes = await this.readBytes(chunk.name);
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
    if (this.#closed) {
      return;
    }

    this.#module._bd_close(this.#handle);
    this.#closed = true;
  }

  private assertOpen(): void {
    if (this.#closed) {
      throw new PayloadFormatError("ByteDist WASM payload is closed.");
    }
  }
}

function readToc(module: ByteDistWasmModule, handle: number): PayloadToc {
  const pointer = module._bd_toc_json_ptr(handle);
  const length = module._bd_toc_json_len(handle);

  if (length < 0) {
    throw readWasmError(module);
  }

  try {
    return JSON.parse(readWasmString(module, pointer, length)) as PayloadToc;
  } catch (error) {
    throw new PayloadFormatError("ByteDist WASM reader returned invalid TOC JSON.", {
      cause: error
    });
  }
}

function listChunkNames(module: ByteDistWasmModule, handle: number): readonly string[] {
  const count = module._bd_chunk_count(handle);
  if (count < 0) {
    throw readWasmError(module);
  }

  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const pointer = module._bd_chunk_name_ptr(handle, index);
    const length = module._bd_chunk_name_len(handle, index);

    if (length < 0) {
      throw readWasmError(module);
    }

    names.push(readWasmString(module, pointer, length));
  }

  return names;
}

function readChunkBytes(module: ByteDistWasmModule, handle: number, name: string): Uint8Array {
  const nameBytes = textEncoder.encode(name);
  const pointer = copyToWasm(module, nameBytes);

  try {
    if (module._bd_read_chunk(handle, pointer, nameBytes.byteLength) !== 1) {
      throw readWasmError(module, name);
    }

    const resultPointer = module._bd_result_ptr(handle);
    const resultLength = module._bd_result_len(handle);
    if (resultLength < 0) {
      throw readWasmError(module, name);
    }

    return resultLength === 0
      ? new Uint8Array()
      : module.HEAPU8.slice(resultPointer, resultPointer + resultLength);
  } finally {
    module._bd_free(pointer);
  }
}

function copyToWasm(module: ByteDistWasmModule, bytes: Uint8Array): number {
  const pointer = module._bd_malloc(bytes.byteLength);
  if (pointer === 0 && bytes.byteLength > 0) {
    throw new PayloadFormatError("ByteDist WASM memory allocation failed.");
  }

  module.HEAPU8.set(bytes, pointer);
  return pointer;
}

function readWasmError(module: ByteDistWasmModule, chunkName?: string): Error {
  const code = module._bd_last_error_code();
  const message = readLastErrorMessage(module) || "ByteDist WASM reader failed.";

  switch (code) {
    case 1:
      return new PayloadFormatError(message);
    case 2:
      return new PayloadVersionError(-1, message);
    case 3:
      return new PayloadIntegrityError(message, chunkName === undefined ? {} : { chunkName });
    case 4:
      return new PayloadChunkNotFoundError(chunkName ?? "", message);
    case 5:
      return new PayloadCompressionError(message);
    default:
      return new PayloadFormatError(message);
  }
}

function readLastErrorMessage(module: ByteDistWasmModule): string {
  return readWasmString(
    module,
    module._bd_last_error_message_ptr(),
    module._bd_last_error_message_len()
  );
}

function readWasmString(module: ByteDistWasmModule, pointer: number, length: number): string {
  if (pointer === 0 || length <= 0) {
    return "";
  }

  return textDecoder.decode(module.HEAPU8.slice(pointer, pointer + length));
}
