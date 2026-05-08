import { describe, expect, it } from "vitest";

import {
  FOOTER_CHECKSUM_NONE,
  FOOTER_MAGIC_BYTES,
  PAYLOAD_FLAGS_NONE,
  PAYLOAD_FOOTER_LENGTH,
  PAYLOAD_FORMAT_VERSION,
  PAYLOAD_HEADER_LENGTH,
  PAYLOAD_MAGIC_BYTES,
  PayloadCompressionError,
  PayloadFormatError,
  createPayload,
  isFooterMagic,
  type PayloadToc
} from "../index.js";

const textDecoder = new TextDecoder();

describe("createPayload", () => {
  it("writes a valid header and footer for one file", async () => {
    const payload = await createPayload({
      files: [
        {
          name: "hello.txt",
          bytes: new TextEncoder().encode("hello"),
          mime: "text/plain",
          encoding: "utf-8"
        }
      ]
    });

    expect(payload.slice(0, 8)).toEqual(PAYLOAD_MAGIC_BYTES);

    const header = dataView(payload, 0, PAYLOAD_HEADER_LENGTH);
    expect(header.getUint32(8, true)).toBe(PAYLOAD_FORMAT_VERSION);
    expect(header.getUint32(12, true)).toBe(PAYLOAD_HEADER_LENGTH);
    expect(header.getUint32(16, true)).toBe(PAYLOAD_FLAGS_NONE);
    expect(header.getUint32(20, true)).toBe(0);

    const footerOffset = payload.byteLength - PAYLOAD_FOOTER_LENGTH;
    expect(payload.slice(footerOffset, footerOffset + 8)).toEqual(FOOTER_MAGIC_BYTES);

    const footer = dataView(payload, footerOffset, PAYLOAD_FOOTER_LENGTH);
    expect(footer.getUint32(8, true)).toBe(PAYLOAD_FORMAT_VERSION);
    expect(readU64(footer, 28)).toBe(payload.byteLength);
    expect(footer.getUint32(36, true)).toBe(FOOTER_CHECKSUM_NONE);
  });

  it("writes one file chunk and a JSON TOC", async () => {
    const bytes = new TextEncoder().encode("hello");
    const payload = await createPayload({
      files: [
        {
          name: "hello.txt",
          bytes,
          mime: "text/plain",
          encoding: "utf-8",
          metadata: { role: "greeting" }
        }
      ],
      createdBy: "bytedist-test",
      metadata: { test: true }
    });

    const toc = readToc(payload);

    expect(toc.version).toBe(0);
    expect(toc.tocEncoding).toBe("json");
    expect(toc.createdBy).toBe("bytedist-test");
    expect(toc.metadata).toEqual({ test: true });
    expect(toc.chunks).toEqual([
      {
        name: "hello.txt",
        offset: PAYLOAD_HEADER_LENGTH,
        length: bytes.byteLength,
        storedLength: bytes.byteLength,
        mime: "text/plain",
        encoding: "utf-8",
        compression: "none",
        metadata: { role: "greeting" }
      }
    ]);
  });

  it("writes multiple chunks in order", async () => {
    const payload = await createPayload({
      files: [
        { name: "a.txt", bytes: new Uint8Array([1, 2]) },
        { name: "b.bin", bytes: new Uint8Array([3, 4, 5]) }
      ]
    });

    const toc = readToc(payload);

    expect(toc.chunks.map((chunk) => chunk.name)).toEqual(["a.txt", "b.bin"]);
    expect(toc.chunks[0]?.offset).toBe(PAYLOAD_HEADER_LENGTH);
    expect(toc.chunks[1]?.offset).toBe(PAYLOAD_HEADER_LENGTH + 2);
  });

  it("allows empty chunks", async () => {
    const payload = await createPayload({
      files: [{ name: "empty.bin", bytes: new Uint8Array() }]
    });

    const toc = readToc(payload);

    expect(toc.chunks[0]).toMatchObject({
      name: "empty.bin",
      offset: PAYLOAD_HEADER_LENGTH,
      length: 0,
      storedLength: 0
    });
  });

  it("generates manifest.json from manifest options", async () => {
    const payload = await createPayload({
      manifest: { title: "Example" },
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
    });

    const toc = readToc(payload);
    const manifestBytes = payload.slice(PAYLOAD_HEADER_LENGTH, PAYLOAD_HEADER_LENGTH + 19);

    expect(toc.manifest).toEqual({ path: "manifest.json" });
    expect(toc.chunks.map((chunk) => chunk.name)).toEqual(["manifest.json", "asset.bin"]);
    expect(toc.chunks[0]).toMatchObject({
      mime: "application/json",
      encoding: "utf-8",
      compression: "none"
    });
    expect(textDecoder.decode(manifestBytes)).toBe('{"title":"Example"}');
  });

  it("rejects manifest plus explicit manifest.json", async () => {
    await expect(
      createPayload({
        manifest: { title: "Example" },
        files: [{ name: "manifest.json", bytes: new Uint8Array([1]) }]
      })
    ).rejects.toThrow(PayloadFormatError);
  });

  it("rejects duplicate chunk names", async () => {
    await expect(
      createPayload({
        files: [
          { name: "duplicate.bin", bytes: new Uint8Array([1]) },
          { name: "duplicate.bin", bytes: new Uint8Array([2]) }
        ]
      })
    ).rejects.toThrow(PayloadFormatError);
  });

  it.each(["", "/absolute", "trailing/", "a//b", "a/../b", "C:/x", "a\\b", "bad\0name"])(
    "rejects unsafe chunk name %s",
    async (name) => {
      await expect(
        createPayload({
          files: [{ name, bytes: new Uint8Array([1]) }]
        })
      ).rejects.toThrow(PayloadFormatError);
    }
  );

  it("rejects non-NFC chunk names", async () => {
    await expect(
      createPayload({
        files: [{ name: "cafe\u0301.txt", bytes: new Uint8Array([1]) }]
      })
    ).rejects.toThrow(PayloadFormatError);
  });

  it("rejects unsupported compression values at runtime", async () => {
    await expect(
      createPayload({
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]), compression: "brotli" as "none" }]
      })
    ).rejects.toThrow(PayloadCompressionError);
  });

  it("emits SHA-256 chunk hashes when requested", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1, 2, 3]) }],
      integrity: "sha256"
    });

    const toc = readToc(payload);

    expect(toc.chunks[0]?.hash?.algorithm).toBe("sha256");
    expect(toc.chunks[0]?.hash?.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("omits chunk hashes by default and when disabled", async () => {
    const withoutOption = readToc(
      await createPayload({
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
      })
    );
    const disabled = readToc(
      await createPayload({
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }],
        integrity: false
      })
    );

    expect(withoutOption.chunks[0]?.hash).toBeUndefined();
    expect(disabled.chunks[0]?.hash).toBeUndefined();
  });

  it("stores TOC offset and length in the footer", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1, 2, 3]) }]
    });
    const footer = readFooter(payload);
    const tocBytes = payload.slice(footer.tocOffset, footer.tocOffset + footer.tocLength);

    expect(footer.tocOffset).toBeGreaterThan(PAYLOAD_HEADER_LENGTH);
    expect(footer.tocLength).toBeGreaterThan(0);
    expect(footer.payloadLength).toBe(payload.byteLength);
    expect(() => JSON.parse(textDecoder.decode(tocBytes))).not.toThrow();
  });

  it("can detect corrupt footer magic with the format helper", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
    });
    const footerOffset = payload.byteLength - PAYLOAD_FOOTER_LENGTH;
    const footerMagic = payload.slice(footerOffset, footerOffset + 8);
    const corruptFooterMagic = new Uint8Array(footerMagic);
    corruptFooterMagic[0] = 0;

    expect(isFooterMagic(footerMagic)).toBe(true);
    expect(isFooterMagic(corruptFooterMagic)).toBe(false);
  });
});

function dataView(bytes: Uint8Array, byteOffset: number, byteLength: number): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset + byteOffset, byteLength);
}

function readFooter(payload: Uint8Array): {
  readonly tocOffset: number;
  readonly tocLength: number;
  readonly payloadLength: number;
} {
  const footer = dataView(
    payload,
    payload.byteLength - PAYLOAD_FOOTER_LENGTH,
    PAYLOAD_FOOTER_LENGTH
  );

  return {
    tocOffset: readU64(footer, 12),
    tocLength: readU64(footer, 20),
    payloadLength: readU64(footer, 28)
  };
}

function readToc(payload: Uint8Array): PayloadToc {
  const footer = readFooter(payload);
  const tocBytes = payload.slice(footer.tocOffset, footer.tocOffset + footer.tocLength);
  return JSON.parse(textDecoder.decode(tocBytes)) as PayloadToc;
}

function readU64(view: DataView, byteOffset: number): number {
  return Number(view.getBigUint64(byteOffset, true));
}
