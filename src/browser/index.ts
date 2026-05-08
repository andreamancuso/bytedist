import { openPayload } from "../core/index.js";
import { PayloadLoadError } from "../format/errors.js";
import type { OpenedPayload } from "../format/types.js";

export interface LoadPayloadFromUrlOptions {
  readonly fetch?: typeof fetch;
  readonly requestInit?: RequestInit;
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

  return openPayload(new Uint8Array(buffer));
}

export async function loadPayloadFromBlob(blob: Blob): Promise<OpenedPayload> {
  let buffer: ArrayBuffer;
  try {
    buffer = await blob.arrayBuffer();
  } catch (error) {
    throw new PayloadLoadError("Failed to read ByteDist payload from Blob.", { cause: error });
  }

  return openPayload(new Uint8Array(buffer));
}

export async function loadPayloadFromFile(file: File): Promise<OpenedPayload> {
  return loadPayloadFromBlob(file);
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
