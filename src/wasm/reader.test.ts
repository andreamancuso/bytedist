import fs from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PAYLOAD_FOOTER_LENGTH,
  PAYLOAD_HEADER_LENGTH,
  createPayload,
  openPayload,
  type PayloadToc
} from "../index.js";
import { crc32 } from "../core/hash.js";
import { writePayloadFooter, writePayloadHeader } from "../core/layout.js";

const wasmModuleUrl = new URL("../../wasm/dist/bytedist_wasm.mjs", import.meta.url);
const wasmBuilt = fs.existsSync(wasmModuleUrl);
const describeWasm = wasmBuilt ? describe : describe.skip;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface ByteDistWasmModule {
  readonly HEAPU8: Uint8Array;
  _bd_malloc(length: number): number;
  _bd_free(pointer: number): void;
  _bd_open(pointer: number, length: number): number;
  _bd_close(handle: number): void;
  _bd_chunk_count(handle: number): number;
  _bd_chunk_name_ptr(handle: number, index: number): number;
  _bd_chunk_name_len(handle: number, index: number): number;
  _bd_read_chunk(handle: number, namePointer: number, nameLength: number): number;
  _bd_result_ptr(handle: number): number;
  _bd_result_len(handle: number): number;
  _bd_last_error_code(): number;
  _bd_last_error_message_ptr(): number;
  _bd_last_error_message_len(): number;
}

describeWasm("MVP WASM reader", () => {
  it("opens valid payloads and lists chunks in TypeScript reader order", async () => {
    const wasm = await loadWasm();
    const payload = await createPayload({
      manifest: { title: "Example" },
      files: [
        { name: "chunks/opaque-001", bytes: new Uint8Array([1, 2, 3]) },
        { name: "notes/readme.txt", bytes: textEncoder.encode("hello") }
      ],
      integrity: "sha256"
    });
    const archive = await openPayload(payload);
    const handle = openWasmPayload(wasm, payload);

    try {
      expect(listWasmChunks(wasm, handle)).toEqual(archive.list());
      expect(readWasmChunk(wasm, handle, "manifest.json")).toEqual(
        textEncoder.encode('{"title":"Example"}')
      );
      expect(readWasmChunk(wasm, handle, "chunks/opaque-001")).toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      wasm._bd_close(handle);
    }
  });

  it("returns structured errors for invalid payloads", async () => {
    const wasm = await loadWasm();
    const cases: ReadonlyArray<readonly [string, Uint8Array, number]> = [
      ["invalid header magic", mutate(await oneChunkPayload(), 0, 0), 1],
      ["unsupported header version", mutateU32(await oneChunkPayload(), 8, 1), 2],
      [
        "invalid footer magic",
        mutate(
          await oneChunkPayload(),
          (await oneChunkPayload()).byteLength - PAYLOAD_FOOTER_LENGTH,
          0
        ),
        1
      ],
      ["invalid TOC JSON", buildPayloadWithToc("{", new Uint8Array([1])), 1],
      [
        "duplicate chunk names",
        buildPayloadWithToc(
          {
            version: 0,
            tocEncoding: "json",
            chunks: [
              chunkRecord("same.bin", PAYLOAD_HEADER_LENGTH, 1),
              chunkRecord("same.bin", PAYLOAD_HEADER_LENGTH + 1, 1)
            ]
          },
          new Uint8Array([1, 2])
        ),
        1
      ],
      [
        "unsafe chunk name",
        buildPayloadWithToc(
          {
            version: 0,
            tocEncoding: "json",
            chunks: [chunkRecord("../secret.bin", PAYLOAD_HEADER_LENGTH, 1)]
          },
          new Uint8Array([1])
        ),
        1
      ],
      [
        "out-of-range chunk",
        buildPayloadWithToc(
          {
            version: 0,
            tocEncoding: "json",
            chunks: [chunkRecord("asset.bin", 9999, 1)]
          },
          new Uint8Array([1])
        ),
        1
      ]
    ];

    for (const [label, payload, errorCode] of cases) {
      expect(openWasmPayloadResult(wasm, payload), label).toEqual({
        handle: 0,
        errorCode
      });
      expect(readLastError(wasm), label).not.toBe("");
    }
  });

  it("returns an integrity error for TOC CRC32 mismatches", async () => {
    const wasm = await loadWasm();
    const payload = buildPayloadWithToc(
      {
        version: 0,
        tocEncoding: "json",
        chunks: [chunkRecord("asset.bin", PAYLOAD_HEADER_LENGTH, 1)]
      },
      new Uint8Array([1])
    );
    const footer = readFooter(payload);
    payload[footer.tocOffset + 1] = payload[footer.tocOffset + 1] === 48 ? 49 : 48;

    expect(openWasmPayloadResult(wasm, payload)).toEqual({
      handle: 0,
      errorCode: 3
    });
  });

  it("returns not-found and unsupported-compression errors from chunk reads", async () => {
    const wasm = await loadWasm();
    const compressed = await createPayload({
      files: [{ name: "asset.txt", bytes: textEncoder.encode("aaaaaa") }],
      compression: "fake",
      compressionCodecs: [fakeShrinkingCodec]
    });
    const handle = openWasmPayload(wasm, compressed);

    try {
      expect(readWasmChunkResult(wasm, handle, "missing.txt")).toEqual({
        ok: false,
        errorCode: 4
      });
      expect(readWasmChunkResult(wasm, handle, "asset.txt")).toEqual({
        ok: false,
        errorCode: 5
      });
    } finally {
      wasm._bd_close(handle);
    }
  });
});

async function loadWasm(): Promise<ByteDistWasmModule> {
  const module = (await import(wasmModuleUrl.href)) as {
    default: () => Promise<ByteDistWasmModule>;
  };
  return module.default();
}

function openWasmPayload(wasm: ByteDistWasmModule, payload: Uint8Array): number {
  const result = openWasmPayloadResult(wasm, payload);
  if (result.handle === 0) {
    throw new Error(readLastError(wasm));
  }
  return result.handle;
}

function openWasmPayloadResult(
  wasm: ByteDistWasmModule,
  payload: Uint8Array
): { readonly handle: number; readonly errorCode: number } {
  const pointer = copyToWasm(wasm, payload);
  try {
    const handle = wasm._bd_open(pointer, payload.byteLength);
    return {
      handle,
      errorCode: wasm._bd_last_error_code()
    };
  } finally {
    wasm._bd_free(pointer);
  }
}

function listWasmChunks(wasm: ByteDistWasmModule, handle: number): readonly string[] {
  const count = wasm._bd_chunk_count(handle);
  const names: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const pointer = wasm._bd_chunk_name_ptr(handle, index);
    const length = wasm._bd_chunk_name_len(handle, index);
    names.push(readWasmString(wasm, pointer, length));
  }

  return names;
}

function readWasmChunk(wasm: ByteDistWasmModule, handle: number, name: string): Uint8Array {
  const result = readWasmChunkResult(wasm, handle, name);
  if (!result.ok) {
    throw new Error(readLastError(wasm));
  }

  const pointer = wasm._bd_result_ptr(handle);
  const length = wasm._bd_result_len(handle);
  return wasm.HEAPU8.slice(pointer, pointer + length);
}

function readWasmChunkResult(
  wasm: ByteDistWasmModule,
  handle: number,
  name: string
): { readonly ok: boolean; readonly errorCode: number } {
  const nameBytes = textEncoder.encode(name);
  const pointer = copyToWasm(wasm, nameBytes);

  try {
    return {
      ok: wasm._bd_read_chunk(handle, pointer, nameBytes.byteLength) === 1,
      errorCode: wasm._bd_last_error_code()
    };
  } finally {
    wasm._bd_free(pointer);
  }
}

function copyToWasm(wasm: ByteDistWasmModule, bytes: Uint8Array): number {
  const pointer = wasm._bd_malloc(bytes.byteLength);
  if (pointer === 0 && bytes.byteLength > 0) {
    throw new Error("ByteDist WASM allocation failed.");
  }
  wasm.HEAPU8.set(bytes, pointer);
  return pointer;
}

function readLastError(wasm: ByteDistWasmModule): string {
  const pointer = wasm._bd_last_error_message_ptr();
  const length = wasm._bd_last_error_message_len();
  return readWasmString(wasm, pointer, length);
}

function readWasmString(wasm: ByteDistWasmModule, pointer: number, length: number): string {
  if (pointer === 0 || length <= 0) {
    return "";
  }
  return textDecoder.decode(wasm.HEAPU8.slice(pointer, pointer + length));
}

async function oneChunkPayload(): Promise<Uint8Array> {
  return createPayload({
    files: [{ name: "asset.bin", bytes: new Uint8Array([1]) }]
  });
}

function mutate(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = bytes.slice();
  copy[offset] = value;
  return copy;
}

function mutateU32(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = bytes.slice();
  dataView(copy, offset, 4).setUint32(0, value, true);
  return copy;
}

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

function dataView(bytes: Uint8Array, byteOffset: number, byteLength: number): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset + byteOffset, byteLength);
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
