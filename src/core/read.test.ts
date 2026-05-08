import { describe, expect, it } from "vitest";

import {
  FOOTER_CHECKSUM_NONE,
  PAYLOAD_FOOTER_LENGTH,
  PAYLOAD_FORMAT_VERSION,
  PAYLOAD_HEADER_LENGTH,
  PayloadChunkNotFoundError,
  PayloadCompressionError,
  PayloadFormatError,
  PayloadUnsupportedFeatureError,
  PayloadVersionError,
  createPayload,
  openPayload,
  type PayloadToc
} from "../index.js";
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

  it("throws a typed unsupported-feature error from verify", async () => {
    const archive = await openPayload(
      await createPayload({
        files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
      })
    );

    await expect(archive.verify()).rejects.toThrow(PayloadUnsupportedFeatureError);
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

    await expect(openPayload(payload)).rejects.toThrow(PayloadCompressionError);
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
});

function buildPayloadWithToc(toc: unknown, chunkBytes: Uint8Array): Uint8Array {
  const tocBytes =
    typeof toc === "string" ? textEncoder.encode(toc) : textEncoder.encode(JSON.stringify(toc));
  const tocOffset = PAYLOAD_HEADER_LENGTH + chunkBytes.byteLength;
  const payloadLength = tocOffset + tocBytes.byteLength + PAYLOAD_FOOTER_LENGTH;
  const footer = writePayloadFooter({
    tocOffset,
    tocLength: tocBytes.byteLength,
    payloadLength
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
