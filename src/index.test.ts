import { describe, expect, it } from "vitest";

import {
  ByteDistError,
  FOOTER_MAGIC_BYTES,
  FOOTER_MAGIC_LENGTH,
  FOOTER_MAGIC_TEXT,
  PAYLOAD_FORMAT_VERSION,
  PAYLOAD_MAGIC_BYTES,
  PAYLOAD_MAGIC_LENGTH,
  PAYLOAD_MAGIC_TEXT,
  PayloadChunkNotFoundError,
  PayloadCompressionError,
  PayloadEmbeddingError,
  PayloadFormatError,
  PayloadIntegrityError,
  PayloadIntegrityMetadataMissingError,
  PayloadIntegrityMismatchError,
  PayloadSignatureError,
  PayloadVersionError,
  assertFooterMagic,
  assertPayloadMagic,
  assertSupportedFormatVersion,
  assertValidChunkName,
  computePayloadHash,
  isFooterMagic,
  isPayloadMagic,
  isSupportedFormatVersion,
  isValidChunkName,
  type CreatePayloadOptions,
  type JsonValue,
  type OpenedPayload,
  type PayloadToc
} from "./index.js";

describe("format constants", () => {
  it("exports the fixed payload magic bytes", () => {
    expect(PAYLOAD_MAGIC_TEXT).toBe("BDISTPAY");
    expect(PAYLOAD_MAGIC_BYTES).toEqual(new Uint8Array([66, 68, 73, 83, 84, 80, 65, 89]));
    expect(PAYLOAD_MAGIC_LENGTH).toBe(8);
  });

  it("exports distinct fixed footer magic bytes", () => {
    expect(FOOTER_MAGIC_TEXT).toBe("BDISTEND");
    expect(FOOTER_MAGIC_BYTES).toEqual(new Uint8Array([66, 68, 73, 83, 84, 69, 78, 68]));
    expect(FOOTER_MAGIC_LENGTH).toBe(8);
    expect(FOOTER_MAGIC_BYTES).not.toEqual(PAYLOAD_MAGIC_BYTES);
  });

  it("exports the initial payload format version", () => {
    expect(PAYLOAD_FORMAT_VERSION).toBe(0);
  });
});

describe("format validation", () => {
  it("accepts valid payload magic bytes", () => {
    expect(isPayloadMagic(PAYLOAD_MAGIC_BYTES)).toBe(true);
    expect(() => assertPayloadMagic(PAYLOAD_MAGIC_BYTES)).not.toThrow();
  });

  it("rejects invalid payload magic bytes", () => {
    const invalid = new Uint8Array(PAYLOAD_MAGIC_BYTES);
    invalid[0] = 0;

    expect(isPayloadMagic(invalid)).toBe(false);
    expect(() => assertPayloadMagic(invalid)).toThrow(PayloadFormatError);
  });

  it("rejects short payload magic byte arrays", () => {
    expect(isPayloadMagic(PAYLOAD_MAGIC_BYTES.slice(0, 4))).toBe(false);
  });

  it("accepts valid footer magic bytes", () => {
    expect(isFooterMagic(FOOTER_MAGIC_BYTES)).toBe(true);
    expect(() => assertFooterMagic(FOOTER_MAGIC_BYTES)).not.toThrow();
  });

  it("rejects invalid footer magic bytes", () => {
    const invalid = new Uint8Array(FOOTER_MAGIC_BYTES);
    invalid[7] = 0;

    expect(isFooterMagic(invalid)).toBe(false);
    expect(() => assertFooterMagic(invalid)).toThrow(PayloadFormatError);
  });

  it("rejects short footer magic byte arrays", () => {
    expect(isFooterMagic(FOOTER_MAGIC_BYTES.slice(0, 4))).toBe(false);
  });

  it("accepts supported format versions", () => {
    expect(isSupportedFormatVersion(0)).toBe(true);
    expect(() => assertSupportedFormatVersion(0)).not.toThrow();
  });

  it("rejects unsupported format versions", () => {
    expect(isSupportedFormatVersion(1)).toBe(false);
    expect(() => assertSupportedFormatVersion(1)).toThrow(PayloadVersionError);
  });

  it("accepts valid chunk names", () => {
    expect(isValidChunkName("manifest.json")).toBe(true);
    expect(isValidChunkName("assets/image.webp")).toBe(true);
    expect(() => assertValidChunkName("assets/image.webp")).not.toThrow();
  });

  it("rejects invalid chunk names", () => {
    expect(isValidChunkName("../secret.txt")).toBe(false);
    expect(() => assertValidChunkName("../secret.txt")).toThrow(PayloadFormatError);
  });
});

describe("format errors", () => {
  it.each([
    [PayloadFormatError, "bad format"],
    [PayloadIntegrityError, "bad hash"],
    [PayloadIntegrityMetadataMissingError, "missing hash"],
    [PayloadIntegrityMismatchError, "mismatched hash"],
    [PayloadSignatureError, "bad signature"],
    [PayloadCompressionError, "bad compression"],
    [PayloadEmbeddingError, "bad embedding"]
  ])("preserves message and error identity for %s", (ErrorClass, message) => {
    const error = new ErrorClass(message);

    expect(error).toBeInstanceOf(ErrorClass);
    expect(error).toBeInstanceOf(ByteDistError);
    expect(error.name).toBe(ErrorClass.name);
    expect(error.message).toBe(message);
  });

  it("stores unsupported format versions", () => {
    const error = new PayloadVersionError(99);

    expect(error).toBeInstanceOf(ByteDistError);
    expect(error.version).toBe(99);
    expect(error.message).toContain("99");
  });

  it("stores missing chunk names", () => {
    const error = new PayloadChunkNotFoundError("manifest.json");

    expect(error).toBeInstanceOf(ByteDistError);
    expect(error.chunkName).toBe("manifest.json");
    expect(error.message).toContain("manifest.json");
  });
});

describe("public types", () => {
  it("supports planned payload and reader shapes at compile time", () => {
    const options: CreatePayloadOptions = {
      manifest: { title: "Example", version: 1 },
      chunkOrder: "name",
      files: [
        {
          name: "manifest.json",
          bytes: new Uint8Array([123, 125]),
          mime: "application/json",
          encoding: "utf-8",
          compression: "none",
          metadata: { role: "manifest" }
        }
      ],
      integrity: "sha256",
      compression: "none"
    };

    const toc: PayloadToc = {
      version: 0,
      tocEncoding: "json",
      manifest: { path: "manifest.json" },
      chunks: [
        {
          name: "manifest.json",
          offset: 64,
          length: 2,
          storedLength: 2,
          mime: "application/json",
          encoding: "utf-8",
          compression: "none",
          hash: {
            algorithm: "sha256",
            value: "placeholder"
          }
        }
      ]
    };

    const opened: OpenedPayload = {
      formatVersion: 0,
      getToc: () => toc,
      list: () => ["manifest.json"],
      has: (name) => name === "manifest.json",
      readBytes: async () => new Uint8Array([123, 125]),
      readText: async () => "{}",
      readJson: async <T extends JsonValue = JsonValue>() => ({}) as T,
      verify: async () => undefined,
      close: () => undefined
    };

    expect(options.files).toHaveLength(1);
    expect(computePayloadHash).toBeTypeOf("function");
    expect(opened.getToc().chunks[0]?.name).toBe("manifest.json");
  });
});
