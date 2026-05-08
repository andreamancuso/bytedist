import fs from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PAYLOAD_HEADER_LENGTH,
  PayloadChunkNotFoundError,
  PayloadFormatError,
  PayloadIntegrityMetadataMissingError,
  PayloadIntegrityMismatchError,
  createPayload,
  openPayload
} from "../index.js";
import { encodeBase64 } from "../html/index.js";
import {
  createWasmReader,
  openEmbeddedPayloadWithWasm,
  openPayloadWithWasm,
  readEmbeddedWasmReader,
  type ByteDistWasmModuleFactory
} from "./index.js";

const wasmModuleUrl = new URL("../../wasm/dist/bytedist_wasm.mjs", import.meta.url);
const wasmBinaryUrl = new URL("../../wasm/dist/bytedist_wasm.wasm", import.meta.url);
const wasmBuilt = fs.existsSync(wasmModuleUrl) && fs.existsSync(wasmBinaryUrl);
const describeWasm = wasmBuilt ? describe : describe.skip;
const textEncoder = new TextEncoder();

describeWasm("WASM runtime wrapper", () => {
  it("opens payloads through an OpenedPayload-compatible wrapper", async () => {
    const payload = await createPayload({
      manifest: { title: "Example", version: 1 },
      files: [
        { name: "chunks/opaque-001", bytes: new Uint8Array([1, 2, 3]) },
        { name: "notes/readme.txt", bytes: textEncoder.encode("hello") },
        { name: "metadata/config.json", bytes: textEncoder.encode('{"enabled":true}') }
      ],
      integrity: "sha256"
    });
    const expected = await openPayload(payload);
    const archive = await openPayloadWithWasm(payload, {
      moduleFactory: await loadModuleFactory()
    });

    try {
      expect(archive.formatVersion).toBe(expected.formatVersion);
      expect(archive.list()).toEqual(expected.list());
      expect(archive.has("chunks/opaque-001")).toBe(true);
      expect(archive.getToc()).toEqual(expected.getToc());
      await expect(archive.readBytes("chunks/opaque-001")).resolves.toEqual(
        new Uint8Array([1, 2, 3])
      );
      await expect(archive.readText("notes/readme.txt")).resolves.toBe("hello");
      await expect(archive.readJson("metadata/config.json")).resolves.toEqual({ enabled: true });
      await expect(archive.verify()).resolves.toBeUndefined();
    } finally {
      archive.close();
    }
  });

  it("maps WASM failures to typed ByteDist errors", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
    });
    const invalid = payload.slice();
    invalid[0] = 0;
    const archive = await openPayloadWithWasm(payload, {
      moduleFactory: await loadModuleFactory()
    });

    try {
      await expect(
        openPayloadWithWasm(invalid, { moduleFactory: await loadModuleFactory() })
      ).rejects.toThrow(PayloadFormatError);
      await expect(archive.readBytes("missing.bin")).rejects.toThrow(PayloadChunkNotFoundError);
      archive.close();
      expect(() => archive.list()).toThrow(PayloadFormatError);
    } finally {
      archive.close();
    }
  });

  it("verifies hashes in the wrapper and reports integrity failures", async () => {
    const hashless = await openPayloadWithWasm(
      await createPayload({
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
      }),
      { moduleFactory: await loadModuleFactory() }
    );
    await expect(hashless.verify()).rejects.toThrow(PayloadIntegrityMetadataMissingError);
    hashless.close();

    const tampered = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }],
      integrity: "sha256"
    });
    tampered[PAYLOAD_HEADER_LENGTH] = 2;
    const archive = await openPayloadWithWasm(tampered, {
      moduleFactory: await loadModuleFactory()
    });

    try {
      await expect(archive.verify()).rejects.toThrow(PayloadIntegrityMismatchError);
    } finally {
      archive.close();
    }
  });

  it("instantiates from embedded WASM bytes and opens embedded payloads", async () => {
    const moduleFactory = await loadModuleFactory();
    const wasmBytes = new Uint8Array(fs.readFileSync(wasmBinaryUrl));
    const payload = await createPayload({
      files: [{ name: "message.txt", bytes: textEncoder.encode("embedded") }],
      integrity: "sha256"
    });
    const document = createDocumentStub(payload, wasmBytes);

    const reader = await readEmbeddedWasmReader({ moduleFactory, document });
    const fromReader = await reader.openPayload(payload);
    const fromEmbedded = await openEmbeddedPayloadWithWasm({ moduleFactory, document });

    try {
      await expect(fromReader.readText("message.txt")).resolves.toBe("embedded");
      await expect(fromEmbedded.readText("message.txt")).resolves.toBe("embedded");
    } finally {
      fromReader.close();
      fromEmbedded.close();
    }
  });

  it("falls back to the TypeScript reader only when requested", async () => {
    const payload = await createPayload({
      files: [{ name: "message.txt", bytes: textEncoder.encode("fallback") }]
    });
    const failingFactory: ByteDistWasmModuleFactory = async () => {
      throw new Error("WASM unavailable");
    };

    await expect(openPayloadWithWasm(payload, { moduleFactory: failingFactory })).rejects.toThrow(
      "WASM unavailable"
    );

    const archive = await openPayloadWithWasm(payload, {
      moduleFactory: failingFactory,
      fallback: "typescript"
    });

    try {
      await expect(archive.readText("message.txt")).resolves.toBe("fallback");
    } finally {
      archive.close();
    }

    const document = createDocumentStub(payload);
    const embeddedArchive = await openEmbeddedPayloadWithWasm({
      moduleFactory: failingFactory,
      document,
      fallback: "typescript"
    });

    try {
      await expect(embeddedArchive.readText("message.txt")).resolves.toBe("fallback");
    } finally {
      embeddedArchive.close();
    }
  });
});

async function loadModuleFactory(): Promise<ByteDistWasmModuleFactory> {
  const module = (await import(wasmModuleUrl.href)) as {
    default: ByteDistWasmModuleFactory;
  };
  return module.default;
}

function createDocumentStub(
  payload: Uint8Array,
  wasm?: Uint8Array
): Pick<Document, "querySelector"> {
  return {
    querySelector(selector: string): { readonly textContent: string } | null {
      if (selector.includes("data-bytedist-payload")) {
        return { textContent: encodeBase64(payload) };
      }

      if (selector.includes("data-bytedist-wasm") && wasm !== undefined) {
        return { textContent: encodeBase64(wasm) };
      }

      return null;
    }
  } as Pick<Document, "querySelector">;
}
