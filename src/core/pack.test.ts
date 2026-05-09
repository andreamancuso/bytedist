import { describe, expect, it } from "vitest";

import {
  FOOTER_MAGIC_BYTES,
  PAYLOAD_FLAGS_NONE,
  PAYLOAD_FOOTER_LENGTH,
  PAYLOAD_FORMAT_VERSION,
  PAYLOAD_HEADER_LENGTH,
  PAYLOAD_MAGIC_BYTES,
  PayloadCompressionError,
  PayloadFormatError,
  computePayloadHash,
  createPayload,
  isFooterMagic,
  type PayloadToc
} from "../index.js";
import { crc32 } from "./hash.js";

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
    expect(footer.getUint32(36, true)).toBe(crc32(readTocBytes(payload)));
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

  it("preserves input chunk order by default", async () => {
    const payload = await createPayload({
      files: [
        { name: "z.txt", bytes: new Uint8Array([1]) },
        { name: "a.txt", bytes: new Uint8Array([2]) }
      ]
    });

    expect(readToc(payload).chunks.map((chunk) => chunk.name)).toEqual(["z.txt", "a.txt"]);
  });

  it("can sort caller-provided chunks by name", async () => {
    const left = await createPayload({
      chunkOrder: "name",
      files: [
        { name: "z.txt", bytes: new Uint8Array([1]) },
        { name: "a.txt", bytes: new Uint8Array([2]) }
      ]
    });
    const right = await createPayload({
      chunkOrder: "name",
      files: [
        { name: "a.txt", bytes: new Uint8Array([2]) },
        { name: "z.txt", bytes: new Uint8Array([1]) }
      ]
    });

    expect(readToc(left).chunks.map((chunk) => chunk.name)).toEqual(["a.txt", "z.txt"]);
    expect(left).toEqual(right);
  });

  it("keeps generated manifests first when sorting chunks by name", async () => {
    const payload = await createPayload({
      manifest: { title: "Example" },
      chunkOrder: "name",
      files: [
        { name: "z.txt", bytes: new Uint8Array([1]) },
        { name: "a.txt", bytes: new Uint8Array([2]) }
      ]
    });

    expect(readToc(payload).chunks.map((chunk) => chunk.name)).toEqual([
      "manifest.json",
      "a.txt",
      "z.txt"
    ]);
  });

  it("rejects unsupported chunk ordering values at runtime", async () => {
    await expect(
      createPayload({
        chunkOrder: "mtime" as "name",
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
      })
    ).rejects.toThrow(PayloadFormatError);
  });

  it("produces identical bytes for identical inputs", async () => {
    const options = {
      manifest: { entry: "a.txt" },
      files: [{ name: "a.txt", bytes: new TextEncoder().encode("hello") }],
      integrity: "sha256" as const,
      createdBy: "bytedist-test"
    };

    await expect(createPayload(options)).resolves.toEqual(await createPayload(options));
  });

  it("computes stable whole-payload SHA-256 hashes", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1, 2, 3]) }],
      integrity: "sha256"
    });
    const changed = payload.slice();
    changed[PAYLOAD_HEADER_LENGTH] = 9;

    const hash = await computePayloadHash(payload);
    const repeatedHash = await computePayloadHash(payload);
    const changedHash = await computePayloadHash(changed);

    expect(hash).toEqual(repeatedHash);
    expect(hash.algorithm).toBe("sha256");
    expect(hash.value).toMatch(/^[0-9a-f]{64}$/);
    expect(hash.value).not.toBe(changedHash.value);
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

  it("stores compressed chunks when a selected codec shrinks bytes", async () => {
    const bytes = new TextEncoder().encode("aaaaaa");
    const payload = await createPayload({
      files: [{ name: "asset.txt", bytes }],
      compression: "fake",
      compressionCodecs: [fakeShrinkingCodec]
    });
    const toc = readToc(payload);

    expect(toc.chunks[0]).toMatchObject({
      name: "asset.txt",
      length: 6,
      storedLength: 2,
      compression: "fake"
    });
    expect(payload.slice(PAYLOAD_HEADER_LENGTH, PAYLOAD_HEADER_LENGTH + 2)).toEqual(
      new Uint8Array([6, 97])
    );
  });

  it("skips compressed bytes by default when compression grows data", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes }],
      compression: "grow",
      compressionCodecs: [fakeGrowingCodec]
    });

    expect(readToc(payload).chunks[0]).toMatchObject({
      length: 3,
      storedLength: 3,
      compression: "none"
    });
  });

  it("stores compressed bytes when compression mode is always", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes }],
      compression: "grow",
      compressionMode: "always",
      compressionCodecs: [fakeGrowingCodec]
    });

    expect(readToc(payload).chunks[0]).toMatchObject({
      length: 3,
      storedLength: 4,
      compression: "grow"
    });
  });

  it("allows per-file compression to override payload compression", async () => {
    const payload = await createPayload({
      files: [
        { name: "a.txt", bytes: new TextEncoder().encode("aaaaaa"), compression: "fake" },
        { name: "b.bin", bytes: new Uint8Array([1, 2, 3]) }
      ],
      compression: "none",
      compressionCodecs: [fakeShrinkingCodec]
    });

    expect(readToc(payload).chunks.map((chunk) => chunk.compression)).toEqual(["fake", "none"]);
  });

  it("rejects missing selected compression codecs", async () => {
    await expect(
      createPayload({
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }],
        compression: "fake"
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
  return JSON.parse(textDecoder.decode(readTocBytes(payload))) as PayloadToc;
}

function readU64(view: DataView, byteOffset: number): number {
  return Number(view.getBigUint64(byteOffset, true));
}

function readTocBytes(payload: Uint8Array): Uint8Array {
  const footer = readFooter(payload);
  return payload.slice(footer.tocOffset, footer.tocOffset + footer.tocLength);
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

const fakeGrowingCodec = {
  name: "grow",
  async compress(bytes: Uint8Array): Promise<Uint8Array> {
    const output = new Uint8Array(bytes.byteLength + 1);
    output[0] = 0;
    output.set(bytes, 1);
    return output;
  },
  async decompress(bytes: Uint8Array): Promise<Uint8Array> {
    return bytes.slice(1);
  }
};
