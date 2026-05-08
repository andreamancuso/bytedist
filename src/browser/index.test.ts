import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";

import { createPayload } from "../core/index.js";
import {
  PayloadCompressionError,
  PayloadFormatError,
  PayloadIntegrityMismatchError,
  PayloadLoadError
} from "../format/errors.js";
import {
  createChunkObjectUrl,
  loadPayloadFromBlob,
  loadPayloadFromFile,
  loadPayloadFromUrl,
  openEmbeddedPayload,
  openPayloadFromUrlRange,
  readEmbeddedPayload,
  readEmbeddedWasm,
  readChunkAsBlob
} from "./index.js";
import { encodeBase64 } from "../html/index.js";
import { PayloadEmbeddingError } from "../format/errors.js";

const textEncoder = new TextEncoder();

describe("browser payload helpers", () => {
  it("loads a payload from a URL with an injected fetch implementation", async () => {
    const payload = await createBrowserFixture();
    const fetcher = vi.fn(async () => new Response(toArrayBuffer(payload)));

    const archive = await loadPayloadFromUrl("demo.bytedist", { fetch: fetcher });

    await expect(archive.readText("message.txt")).resolves.toBe("hello browser");
    expect(fetcher).toHaveBeenCalledWith("demo.bytedist", undefined);
  });

  it("passes request options to fetch", async () => {
    const payload = await createBrowserFixture();
    const fetcher = vi.fn(async () => new Response(toArrayBuffer(payload)));
    const requestInit = { cache: "no-store" as const };

    await loadPayloadFromUrl("demo.bytedist", { fetch: fetcher, requestInit });

    expect(fetcher).toHaveBeenCalledWith("demo.bytedist", requestInit);
  });

  it("opens external payloads by fetching footer and TOC ranges first", async () => {
    const payload = await createBrowserFixture();
    const toc = readToc(payload);
    const footer = readFooter(payload);
    const fetcher = createRangeFetch(payload);

    const archive = await openPayloadFromUrlRange("demo.bytedist", { fetch: fetcher });

    expect(readRangeHeaders(fetcher)).toEqual([
      "bytes=-40",
      "bytes=0-23",
      `bytes=${footer.tocOffset}-${footer.tocOffset + footer.tocLength - 1}`
    ]);

    await expect(archive.readText("message.txt")).resolves.toBe("hello browser");

    const message = toc.chunks.find((chunk) => chunk.name === "message.txt");
    expect(message).toBeDefined();
    expect(readRangeHeaders(fetcher).at(-1)).toBe(
      `bytes=${message?.offset}-${(message?.offset ?? 0) + (message?.storedLength ?? 0) - 1}`
    );
  });

  it("falls back to full-buffer loading when range requests are ignored", async () => {
    const payload = await createBrowserFixture();
    const fetcher = createRangeFetch(payload, { ignoreRange: true });

    const archive = await openPayloadFromUrlRange("demo.bytedist", { fetch: fetcher });

    await expect(archive.readText("message.txt")).resolves.toBe("hello browser");
    expect(readRangeHeaders(fetcher)).toEqual(["bytes=-40"]);
  });

  it("controls repeated range reads with the cache option", async () => {
    const payload = await createBrowserFixture();
    const toc = readToc(payload);
    const message = toc.chunks.find((chunk) => chunk.name === "message.txt");
    const messageRange = `bytes=${message?.offset}-${(message?.offset ?? 0) + (message?.storedLength ?? 0) - 1}`;

    const uncachedFetch = createRangeFetch(payload);
    const uncached = await openPayloadFromUrlRange("demo.bytedist", { fetch: uncachedFetch });
    await uncached.readText("message.txt");
    await uncached.readText("message.txt");
    expect(readRangeHeaders(uncachedFetch).filter((range) => range === messageRange)).toHaveLength(
      2
    );

    const cachedFetch = createRangeFetch(payload);
    const cached = await openPayloadFromUrlRange("demo.bytedist", {
      fetch: cachedFetch,
      cache: "bytes"
    });
    await cached.readText("message.txt");
    await cached.readText("message.txt");
    expect(readRangeHeaders(cachedFetch).filter((range) => range === messageRange)).toHaveLength(1);
  });

  it("verifies range-loaded payloads lazily and reports integrity failures", async () => {
    const payload = await createBrowserFixture();
    const archive = await openPayloadFromUrlRange("demo.bytedist", {
      fetch: createRangeFetch(payload)
    });

    await expect(archive.verify()).resolves.toBeUndefined();

    const tampered = payload.slice();
    tampered[readToc(tampered).chunks.find((chunk) => chunk.name === "message.txt")?.offset ?? 0] =
      0;
    const tamperedArchive = await openPayloadFromUrlRange("demo.bytedist", {
      fetch: createRangeFetch(tampered)
    });

    await expect(tamperedArchive.verify()).rejects.toThrow(PayloadIntegrityMismatchError);
  });

  it("fails range reads clearly for invalid ranges and closed archives", async () => {
    const payload = await createBrowserFixture();
    await expect(
      openPayloadFromUrlRange("demo.bytedist", {
        fetch: createRangeFetch(payload, { omitContentRange: true })
      })
    ).rejects.toThrow(PayloadLoadError);

    const invalidFooter = payload.slice();
    invalidFooter[invalidFooter.byteLength - 40] = 0;
    await expect(
      openPayloadFromUrlRange("demo.bytedist", { fetch: createRangeFetch(invalidFooter) })
    ).rejects.toThrow(PayloadFormatError);

    const archive = await openPayloadFromUrlRange("demo.bytedist", {
      fetch: createRangeFetch(payload)
    });
    archive.close();
    await expect(archive.readBytes("message.txt")).rejects.toThrow(PayloadFormatError);
  });

  it("reports unsupported compression from range chunk reads", async () => {
    const payload = await createCompressedBrowserFixture();
    const archive = await openPayloadFromUrlRange("demo.bytedist", {
      fetch: createRangeFetch(payload)
    });

    await expect(archive.readBytes("message.txt")).rejects.toThrow(PayloadCompressionError);
  });

  it("reports HTTP failures clearly", async () => {
    const fetcher = vi.fn(
      async () => new Response("missing", { status: 404, statusText: "Not Found" })
    );

    await expect(loadPayloadFromUrl("missing.bytedist", { fetch: fetcher })).rejects.toThrow(
      PayloadLoadError
    );
    await expect(loadPayloadFromUrl("missing.bytedist", { fetch: fetcher })).rejects.toThrow(
      "HTTP 404 Not Found"
    );
  });

  it("wraps rejected fetch calls as load errors", async () => {
    const failure = new Error("network unavailable");
    const fetcher = vi.fn(async () => {
      throw failure;
    });

    await expect(loadPayloadFromUrl("demo.bytedist", { fetch: fetcher })).rejects.toMatchObject({
      cause: failure
    });
  });

  it("loads a payload from a Blob", async () => {
    const payload = await createBrowserFixture();
    const archive = await loadPayloadFromBlob(new Blob([toArrayBuffer(payload)]));

    await expect(archive.readJson("data.json")).resolves.toEqual({ ok: true });
  });

  it("passes compression codecs through Blob loading", async () => {
    const payload = await createCompressedBrowserFixture();
    const archive = await loadPayloadFromBlob(new Blob([toArrayBuffer(payload)]), {
      compressionCodecs: [fakeShrinkingCodec]
    });

    await expect(archive.readText("message.txt")).resolves.toBe("aaaaaa");
  });

  it("loads a payload from a File", async () => {
    const payload = await createBrowserFixture();
    const file = new File([toArrayBuffer(payload)], "demo.bytedist", {
      type: "application/octet-stream"
    });
    const archive = await loadPayloadFromFile(file);

    await expect(archive.readText("message.txt")).resolves.toBe("hello browser");
  });

  it("reads embedded payload bytes from the default selector", async () => {
    const payload = await createBrowserFixture();
    const document = createDocumentStub(encodeBase64(payload));

    expect(readEmbeddedPayload({ document })).toEqual(payload);
    expect(document.querySelector).toHaveBeenCalledWith(
      'script[type="application/octet-stream+base64"][data-bytedist-payload]'
    );
  });

  it("opens embedded payloads from custom selectors", async () => {
    const payload = await createBrowserFixture();
    const document = createDocumentStub(encodeBase64(payload, { lineLength: 12 }));

    const archive = await openEmbeddedPayload({
      document,
      selector: "[data-demo-payload]"
    });

    await expect(archive.readText("message.txt")).resolves.toBe("hello browser");
    await expect(archive.verify()).resolves.toBeUndefined();
    expect(document.querySelector).toHaveBeenCalledWith("[data-demo-payload]");
  });

  it("passes compression codecs through embedded payload opening", async () => {
    const payload = await createCompressedBrowserFixture();
    const document = createDocumentStub(encodeBase64(payload));
    const archive = await openEmbeddedPayload({
      document,
      compressionCodecs: [fakeShrinkingCodec]
    });

    await expect(archive.readText("message.txt")).resolves.toBe("aaaaaa");
  });

  it("reports missing embedded payload elements clearly", () => {
    const document = {
      querySelector: vi.fn(() => null)
    };

    expect(() => readEmbeddedPayload({ document })).toThrow(PayloadEmbeddingError);
  });

  it("reads embedded WASM bytes from the default selector", () => {
    const wasmBytes = new Uint8Array([0, 97, 115, 109]);
    const document = createDocumentStub(encodeBase64(wasmBytes));

    expect(readEmbeddedWasm({ document })).toEqual(wasmBytes);
    expect(document.querySelector).toHaveBeenCalledWith(
      'script[type="application/wasm+base64"][data-bytedist-wasm]'
    );
  });

  it("creates blobs from chunks using TOC MIME metadata", async () => {
    const archive = await loadPayloadFromBlob(
      new Blob([toArrayBuffer(await createBrowserFixture())])
    );
    const blob = await readChunkAsBlob(archive, "image.bin");

    expect(blob.type).toBe("image/png");
    await expect(blob.arrayBuffer()).resolves.toHaveProperty("byteLength", 4);
  });

  it("allows chunk blob MIME overrides", async () => {
    const archive = await loadPayloadFromBlob(
      new Blob([toArrayBuffer(await createBrowserFixture())])
    );
    const blob = await readChunkAsBlob(archive, "image.bin", { mime: "application/custom" });

    expect(blob.type).toBe("application/custom");
  });

  it("creates revocable object URLs for chunks", async () => {
    const archive = await loadPayloadFromBlob(
      new Blob([toArrayBuffer(await createBrowserFixture())])
    );
    const createObjectURL = vi.fn(() => "blob:bytedist-test");
    const revokeObjectURL = vi.fn();

    const resource = await createChunkObjectUrl(archive, "image.bin", {
      urlFactory: { createObjectURL, revokeObjectURL }
    });

    expect(resource.url).toBe("blob:bytedist-test");
    expect(resource.blob.type).toBe("image/png");
    expect(createObjectURL).toHaveBeenCalledWith(resource.blob);

    resource.revoke();
    resource.revoke();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:bytedist-test");
  });

  it("keeps the browser helper source free of Node-only imports", async () => {
    const source = await fs.readFile(new URL("./index.ts", import.meta.url), "utf8");

    expect(source).not.toContain("node:");
  });
});

async function createBrowserFixture(): Promise<Uint8Array> {
  return createPayload({
    integrity: "sha256",
    manifest: { entry: "message.txt" },
    files: [
      {
        name: "message.txt",
        bytes: textEncoder.encode("hello browser"),
        mime: "text/plain",
        encoding: "utf-8"
      },
      {
        name: "data.json",
        bytes: textEncoder.encode(JSON.stringify({ ok: true })),
        mime: "application/json",
        encoding: "utf-8"
      },
      {
        name: "image.bin",
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        mime: "image/png"
      }
    ]
  });
}

async function createCompressedBrowserFixture(): Promise<Uint8Array> {
  return createPayload({
    integrity: "sha256",
    compression: "fake",
    compressionCodecs: [fakeShrinkingCodec],
    files: [
      {
        name: "message.txt",
        bytes: textEncoder.encode("aaaaaa"),
        mime: "text/plain",
        encoding: "utf-8"
      }
    ]
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function readFooter(payload: Uint8Array): {
  readonly tocOffset: number;
  readonly tocLength: number;
} {
  const view = new DataView(payload.buffer, payload.byteOffset + payload.byteLength - 40, 40);

  return {
    tocOffset: Number(view.getBigUint64(12, true)),
    tocLength: Number(view.getBigUint64(20, true))
  };
}

function readToc(payload: Uint8Array): {
  readonly chunks: readonly {
    readonly name: string;
    readonly offset: number;
    readonly storedLength: number;
  }[];
} {
  const footer = readFooter(payload);
  return JSON.parse(
    new TextDecoder().decode(payload.slice(footer.tocOffset, footer.tocOffset + footer.tocLength))
  ) as {
    readonly chunks: readonly {
      readonly name: string;
      readonly offset: number;
      readonly storedLength: number;
    }[];
  };
}

function createRangeFetch(
  payload: Uint8Array,
  options: { readonly ignoreRange?: boolean; readonly omitContentRange?: boolean } = {}
): ReturnType<typeof vi.fn> {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("Range");

    if (options.ignoreRange === true) {
      return new Response(toArrayBuffer(payload));
    }

    if (range === null) {
      return new Response("missing range", { status: 400, statusText: "Bad Request" });
    }

    const bounds = parseRangeHeader(range, payload.byteLength);
    const body = payload.slice(bounds.start, bounds.end + 1);
    const headers = new Headers();
    if (options.omitContentRange !== true) {
      headers.set("Content-Range", `bytes ${bounds.start}-${bounds.end}/${payload.byteLength}`);
    }

    return new Response(toArrayBuffer(body), {
      status: 206,
      statusText: "Partial Content",
      headers
    });
  });
}

function parseRangeHeader(
  range: string,
  totalLength: number
): { readonly start: number; readonly end: number } {
  const suffix = /^bytes=-(\d+)$/.exec(range);
  if (suffix !== null) {
    const length = Number(suffix[1]);
    return {
      start: totalLength - length,
      end: totalLength - 1
    };
  }

  const explicit = /^bytes=(\d+)-(\d+)$/.exec(range);
  if (explicit === null) {
    throw new Error(`Unexpected range header: ${range}`);
  }

  return {
    start: Number(explicit[1]),
    end: Number(explicit[2])
  };
}

function readRangeHeaders(fetcher: ReturnType<typeof vi.fn>): readonly string[] {
  return fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get("Range") ?? "");
}

function createDocumentStub(textContent: string): Pick<Document, "querySelector"> & {
  readonly querySelector: ReturnType<typeof vi.fn>;
} {
  return {
    querySelector: vi.fn(() => ({ textContent }) as Element)
  };
}

const fakeShrinkingCodec = {
  name: "fake",
  async compress(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array([bytes.byteLength, bytes[0] ?? 0]);
  },
  async decompress(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(bytes[0] ?? 0).fill(bytes[1] ?? 0);
  }
};
