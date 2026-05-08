import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";

import { createPayload } from "../core/index.js";
import { PayloadLoadError } from "../format/errors.js";
import {
  createChunkObjectUrl,
  loadPayloadFromBlob,
  loadPayloadFromFile,
  loadPayloadFromUrl,
  readChunkAsBlob
} from "./index.js";

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

  it("loads a payload from a File", async () => {
    const payload = await createBrowserFixture();
    const file = new File([toArrayBuffer(payload)], "demo.bytedist", {
      type: "application/octet-stream"
    });
    const archive = await loadPayloadFromFile(file);

    await expect(archive.readText("message.txt")).resolves.toBe("hello browser");
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
