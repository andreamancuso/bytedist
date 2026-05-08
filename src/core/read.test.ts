import { describe, expect, it } from "vitest";

import {
  PAYLOAD_FOOTER_LENGTH,
  PAYLOAD_FORMAT_VERSION,
  PAYLOAD_HEADER_LENGTH,
  PayloadChunkNotFoundError,
  PayloadCompressionError,
  PayloadFormatError,
  PayloadIntegrityError,
  PayloadIntegrityMetadataMissingError,
  PayloadIntegrityMismatchError,
  PayloadVersionError,
  createPayload,
  openPayload,
  type PayloadToc
} from "../index.js";
import { crc32 } from "./hash.js";
import { writePayloadFooter, writePayloadHeader } from "./layout.js";

const textEncoder = new TextEncoder();

describe("openPayload", () => {
  it("opens one-file payloads and exposes archive metadata", async () => {
    const payload = await createPayload({
      files: [
        {
          name: "hello.txt",
          bytes: textEncoder.encode("hello"),
          mime: "text/plain",
          encoding: "utf-8"
        }
      ]
    });

    const archive = await openPayload(payload);

    expect(archive.formatVersion).toBe(PAYLOAD_FORMAT_VERSION);
    expect(archive.list()).toEqual(["hello.txt"]);
    expect(archive.has("hello.txt")).toBe(true);
    expect(archive.has("missing.txt")).toBe(false);
    expect(archive.getToc().chunks[0]).toMatchObject({
      name: "hello.txt",
      length: 5,
      storedLength: 5,
      mime: "text/plain",
      encoding: "utf-8",
      compression: "none"
    });
  });

  it("opens multiple chunks in TOC order", async () => {
    const payload = await createPayload({
      files: [
        { name: "a.bin", bytes: new Uint8Array([1, 2]) },
        { name: "b.bin", bytes: new Uint8Array([3]) }
      ]
    });

    const archive = await openPayload(payload);

    expect(archive.list()).toEqual(["a.bin", "b.bin"]);
    await expect(archive.readBytes("a.bin")).resolves.toEqual(new Uint8Array([1, 2]));
    await expect(archive.readBytes("b.bin")).resolves.toEqual(new Uint8Array([3]));
  });

  it("returns defensive copies from readBytes", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1, 2, 3]) }]
    });
    const archive = await openPayload(payload);

    const first = await archive.readBytes("asset.bin");
    first[0] = 99;

    await expect(archive.readBytes("asset.bin")).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("reads empty chunks", async () => {
    const archive = await openPayload(
      await createPayload({
        files: [{ name: "empty.bin", bytes: new Uint8Array() }]
      })
    );

    await expect(archive.readBytes("empty.bin")).resolves.toEqual(new Uint8Array());
  });

  it("reads generated manifest JSON", async () => {
    const archive = await openPayload(
      await createPayload({
        manifest: { title: "Example", version: 1 },
        files: []
      })
    );

    await expect(archive.readJson("manifest.json")).resolves.toEqual({
      title: "Example",
      version: 1
    });
  });

  it("reads UTF-8 text", async () => {
    const archive = await openPayload(
      await createPayload({
        files: [{ name: "text.txt", bytes: textEncoder.encode("Zażółć jaźń") }]
      })
    );

    await expect(archive.readText("text.txt")).resolves.toBe("Zażółć jaźń");
  });

  it("throws typed errors for missing chunks", async () => {
    const archive = await openPayload(
      await createPayload({
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
      })
    );

    await expect(archive.readBytes("missing.bin")).rejects.toThrow(PayloadChunkNotFoundError);
  });

  it("wraps invalid JSON chunk parse failures", async () => {
    const archive = await openPayload(
      await createPayload({
        files: [{ name: "bad.json", bytes: textEncoder.encode("{") }]
      })
    );

    await expect(archive.readJson("bad.json")).rejects.toThrow(PayloadFormatError);
  });

  it("verifies hashed payloads", async () => {
    const archive = await openPayload(
      await createPayload({
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }],
        integrity: "sha256"
      })
    );

    await expect(archive.verify()).resolves.toBeUndefined();
  });

  it("throws a typed missing-metadata error from verify for hashless payloads", async () => {
    const archive = await openPayload(
      await createPayload({
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
      })
    );

    await expect(archive.verify()).rejects.toThrow(PayloadIntegrityMetadataMissingError);
  });

  it("throws a typed missing-metadata error from verify for mixed hash metadata", async () => {
    const payload = await createPayload({
      files: [
        { name: "hashed.bin", bytes: new Uint8Array([1]) },
        { name: "hashless.bin", bytes: new Uint8Array([2]) }
      ],
      integrity: "sha256"
    });
    const toc = readToc(payload);
    const rewrittenPayload = rewritePayloadToc(payload, {
      ...toc,
      chunks: toc.chunks.map((chunk) =>
        chunk.name === "hashless.bin"
          ? {
              name: chunk.name,
              offset: chunk.offset,
              length: chunk.length,
              storedLength: chunk.storedLength,
              compression: chunk.compression
            }
          : chunk
      )
    });

    const archive = await openPayload(rewrittenPayload);

    await expect(archive.verify()).rejects.toMatchObject({
      constructor: PayloadIntegrityMetadataMissingError,
      chunkName: "hashless.bin"
    });
  });

  it("reports the failing chunk name when chunk integrity fails", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }],
      integrity: "sha256"
    });
    payload[PAYLOAD_HEADER_LENGTH] = 2;

    const archive = await openPayload(payload);

    await expect(archive.verify()).rejects.toMatchObject({
      constructor: PayloadIntegrityMismatchError,
      chunkName: "asset.bin"
    });
  });

  it("rejects too-short payloads", async () => {
    await expect(openPayload(new Uint8Array([1, 2, 3]))).rejects.toThrow(PayloadFormatError);
  });

  it("rejects invalid header magic", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
    });
    payload[0] = 0;

    await expect(openPayload(payload)).rejects.toThrow(PayloadFormatError);
  });

  it("rejects unsupported header versions", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
    });
    writeU32(payload, 8, 1);

    await expect(openPayload(payload)).rejects.toThrow(PayloadVersionError);
  });

  it("rejects invalid footer magic", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
    });
    payload[payload.byteLength - PAYLOAD_FOOTER_LENGTH] = 0;

    await expect(openPayload(payload)).rejects.toThrow(PayloadFormatError);
  });

  it("rejects unsupported footer versions", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
    });
    writeU32(payload, payload.byteLength - PAYLOAD_FOOTER_LENGTH + 8, 1);

    await expect(openPayload(payload)).rejects.toThrow(PayloadVersionError);
  });

  it("rejects footer payload length mismatch", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
    });
    writeU64(payload, payload.byteLength - PAYLOAD_FOOTER_LENGTH + 28, payload.byteLength + 1);

    await expect(openPayload(payload)).rejects.toThrow(PayloadFormatError);
  });

  it("rejects TOC ranges outside payload bounds", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
    });
    writeU64(payload, payload.byteLength - PAYLOAD_FOOTER_LENGTH + 20, 999_999);

    await expect(openPayload(payload)).rejects.toThrow(PayloadFormatError);
  });

  it("rejects invalid TOC JSON", async () => {
    await expect(openPayload(buildPayloadWithToc("{", new Uint8Array([1])))).rejects.toThrow(
      PayloadFormatError
    );
  });

  it("rejects TOC CRC32 mismatches as integrity failures", async () => {
    const payload = buildPayloadWithToc(
      {
        version: 0,
        tocEncoding: "json",
        chunks: [chunkRecord("asset.bin", PAYLOAD_HEADER_LENGTH, 1)]
      },
      new Uint8Array([1])
    );
    const footerOffset = payload.byteLength - PAYLOAD_FOOTER_LENGTH;
    const footer = dataView(payload, footerOffset, PAYLOAD_FOOTER_LENGTH);
    const tocOffset = Number(footer.getBigUint64(12, true));

    payload[tocOffset + 1] = payload[tocOffset + 1] === 48 ? 49 : 48;

    await expect(openPayload(payload)).rejects.toThrow(PayloadIntegrityError);
  });

  it("rejects malformed TOC shape", async () => {
    await expect(openPayload(buildPayloadWithToc("[]", new Uint8Array([1])))).rejects.toThrow(
      PayloadFormatError
    );
  });

  it("rejects duplicate TOC chunk names", async () => {
    const payload = buildPayloadWithToc(
      {
        version: 0,
        tocEncoding: "json",
        chunks: [
          chunkRecord("same.bin", PAYLOAD_HEADER_LENGTH, 1),
          chunkRecord("same.bin", PAYLOAD_HEADER_LENGTH + 1, 1)
        ]
      },
      new Uint8Array([1, 2])
    );

    await expect(openPayload(payload)).rejects.toThrow(PayloadFormatError);
  });

  it("rejects unsafe TOC chunk names", async () => {
    const payload = buildPayloadWithToc(
      {
        version: 0,
        tocEncoding: "json",
        chunks: [chunkRecord("../secret.bin", PAYLOAD_HEADER_LENGTH, 1)]
      },
      new Uint8Array([1])
    );

    await expect(openPayload(payload)).rejects.toThrow(PayloadFormatError);
  });

  it("rejects chunk ranges outside the data region", async () => {
    const payload = buildPayloadWithToc(
      {
        version: 0,
        tocEncoding: "json",
        chunks: [chunkRecord("asset.bin", 9999, 1)]
      },
      new Uint8Array([1])
    );

    await expect(openPayload(payload)).rejects.toThrow(PayloadFormatError);
  });

  it("rejects unsupported compression in TOC records", async () => {
    const payload = buildPayloadWithToc(
      {
        version: 0,
        tocEncoding: "json",
        chunks: [
          {
            ...chunkRecord("asset.bin", PAYLOAD_HEADER_LENGTH, 1),
            compression: "brotli"
          }
        ]
      },
      new Uint8Array([1])
    );

    const archive = await openPayload(payload);

    await expect(archive.readBytes("asset.bin")).rejects.toThrow(PayloadCompressionError);
  });

  it("rejects storedLength different from length until decompression exists", async () => {
    const payload = buildPayloadWithToc(
      {
        version: 0,
        tocEncoding: "json",
        chunks: [
          {
            ...chunkRecord("asset.bin", PAYLOAD_HEADER_LENGTH, 1),
            storedLength: 0
          }
        ]
      },
      new Uint8Array([1])
    );

    await expect(openPayload(payload)).rejects.toThrow(PayloadCompressionError);
  });

  it("reads compressed chunks when a matching codec is supplied", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.txt", bytes: textEncoder.encode("aaaaaa") }],
      compression: "fake",
      compressionCodecs: [fakeShrinkingCodec]
    });
    const archive = await openPayload(payload, { compressionCodecs: [fakeShrinkingCodec] });

    expect(archive.getToc().chunks[0]).toMatchObject({
      compression: "fake",
      length: 6,
      storedLength: 2
    });
    await expect(archive.readText("asset.txt")).resolves.toBe("aaaaaa");
  });

  it("fails clearly when a compressed chunk is read without its codec", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.txt", bytes: textEncoder.encode("aaaaaa") }],
      compression: "fake",
      compressionCodecs: [fakeShrinkingCodec]
    });
    const archive = await openPayload(payload);

    await expect(archive.readBytes("asset.txt")).rejects.toThrow(PayloadCompressionError);
  });

  it("rejects compressed chunks that decompress to the wrong logical length", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.txt", bytes: textEncoder.encode("aaaaaa") }],
      compression: "fake",
      compressionCodecs: [fakeShrinkingCodec]
    });
    const archive = await openPayload(payload, { compressionCodecs: [badLengthCodec] });

    await expect(archive.readBytes("asset.txt")).rejects.toThrow(PayloadCompressionError);
  });

  it("verifies compressed chunk hashes against logical bytes", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.txt", bytes: textEncoder.encode("aaaaaa") }],
      compression: "fake",
      compressionCodecs: [fakeShrinkingCodec],
      integrity: "sha256"
    });
    const archive = await openPayload(payload, { compressionCodecs: [fakeShrinkingCodec] });

    await expect(archive.verify()).resolves.toBeUndefined();
  });

  it("reports integrity mismatches after decompressing tampered stored bytes", async () => {
    const payload = await createPayload({
      files: [{ name: "asset.txt", bytes: textEncoder.encode("aaaaaa") }],
      compression: "fake",
      compressionCodecs: [fakeShrinkingCodec],
      integrity: "sha256"
    });
    payload[PAYLOAD_HEADER_LENGTH + 1] = 98;

    const archive = await openPayload(payload, { compressionCodecs: [fakeShrinkingCodec] });

    await expect(archive.verify()).rejects.toMatchObject({
      constructor: PayloadIntegrityMismatchError,
      chunkName: "asset.txt"
    });
  });
});

function buildPayloadWithToc(toc: unknown, chunkBytes: Uint8Array): Uint8Array {
  const tocBytes =
    typeof toc === "string" ? textEncoder.encode(toc) : textEncoder.encode(JSON.stringify(toc));
  const tocOffset = PAYLOAD_HEADER_LENGTH + chunkBytes.byteLength;
  const payloadLength = tocOffset + tocBytes.byteLength + PAYLOAD_FOOTER_LENGTH;
  const footer = writePayloadFooter({
    tocOffset,
    tocLength: tocBytes.byteLength,
    payloadLength,
    footerChecksum: crc32(tocBytes)
  });
  const payload = new Uint8Array(payloadLength);

  payload.set(writePayloadHeader(), 0);
  payload.set(chunkBytes, PAYLOAD_HEADER_LENGTH);
  payload.set(tocBytes, tocOffset);
  payload.set(footer, tocOffset + tocBytes.byteLength);

  return payload;
}

function chunkRecord(name: string, offset: number, length: number): PayloadToc["chunks"][number] {
  return {
    name,
    offset,
    length,
    storedLength: length,
    compression: "none"
  };
}

function writeU32(bytes: Uint8Array, byteOffset: number, value: number): void {
  dataView(bytes, byteOffset, 4).setUint32(0, value, true);
}

function writeU64(bytes: Uint8Array, byteOffset: number, value: number): void {
  dataView(bytes, byteOffset, 8).setBigUint64(0, BigInt(value), true);
}

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
    tocOffset: Number(footer.getBigUint64(12, true)),
    tocLength: Number(footer.getBigUint64(20, true)),
    payloadLength: Number(footer.getBigUint64(28, true))
  };
}

function readToc(payload: Uint8Array): PayloadToc {
  const footer = readFooter(payload);
  return JSON.parse(
    new TextDecoder().decode(payload.slice(footer.tocOffset, footer.tocOffset + footer.tocLength))
  ) as PayloadToc;
}

function rewritePayloadToc(payload: Uint8Array, toc: PayloadToc): Uint8Array {
  const footer = readFooter(payload);
  const chunkBytes = payload.slice(PAYLOAD_HEADER_LENGTH, footer.tocOffset);
  const tocBytes = textEncoder.encode(JSON.stringify(toc));
  const payloadLength =
    PAYLOAD_HEADER_LENGTH + chunkBytes.byteLength + tocBytes.byteLength + PAYLOAD_FOOTER_LENGTH;
  const rewritten = new Uint8Array(payloadLength);
  const newTocOffset = PAYLOAD_HEADER_LENGTH + chunkBytes.byteLength;
  const newFooter = writePayloadFooter({
    tocOffset: newTocOffset,
    tocLength: tocBytes.byteLength,
    payloadLength,
    footerChecksum: crc32(tocBytes)
  });

  rewritten.set(writePayloadHeader(), 0);
  rewritten.set(chunkBytes, PAYLOAD_HEADER_LENGTH);
  rewritten.set(tocBytes, newTocOffset);
  rewritten.set(newFooter, newTocOffset + tocBytes.byteLength);

  return rewritten;
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

const badLengthCodec = {
  name: "fake",
  async compress(bytes: Uint8Array): Promise<Uint8Array> {
    return bytes;
  },
  async decompress(): Promise<Uint8Array> {
    return new Uint8Array();
  }
};
