import { deflateSync, inflateSync } from "node:zlib";
import { performance } from "node:perf_hooks";

import { createPayload, openPayload } from "../dist/index.js";
import { decodeBase64, encodeBase64 } from "../dist/html/index.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const quick = process.argv.includes("--quick");
const iterations = quick ? 3 : 9;

const cases = [
  {
    name: "many small",
    count: quick ? 120 : 1_000,
    size: 1024,
    compression: "none",
    pattern: "mixed"
  },
  {
    name: "few large",
    count: quick ? 3 : 4,
    size: quick ? 512 * 1024 : 4 * 1024 * 1024,
    compression: "none",
    pattern: "mixed"
  },
  {
    name: "many small deflate",
    count: quick ? 120 : 1_000,
    size: 1024,
    compression: "deflate-local",
    pattern: "repeated"
  },
  {
    name: "few large deflate",
    count: quick ? 3 : 4,
    size: quick ? 512 * 1024 : 4 * 1024 * 1024,
    compression: "deflate-local",
    pattern: "repeated"
  }
];

const codec = {
  name: "deflate-local",
  async compress(bytes) {
    return new Uint8Array(deflateSync(bytes));
  },
  async decompress(bytes) {
    return new Uint8Array(inflateSync(bytes));
  }
};

console.log("ByteDist performance baseline");
console.log(`Mode: ${quick ? "quick" : "full"}`);
console.log(`Iterations per timing: ${iterations}`);
console.log(`GC memory deltas: ${typeof globalThis.gc === "function" ? "enabled" : "unavailable"}`);
console.log("");

const results = [];

for (const testCase of cases) {
  results.push(await measureCase(testCase));
}

printTable(
  [
    "case",
    "chunks",
    "input",
    "payload",
    "pack ms",
    "open ms",
    "toc ms",
    "read one",
    "read all",
    "verify"
  ],
  results.map((result) => [
    result.name,
    formatNumber(result.chunkCount),
    formatBytes(result.inputBytes),
    formatBytes(result.payloadBytes),
    formatMs(result.packMs),
    formatMs(result.openMs),
    formatMs(result.tocParseMs),
    formatMs(result.readOneMs),
    formatMs(result.readAllMs),
    formatMs(result.verifyMs)
  ])
);

console.log("");
printTable(
  ["case", "payload", "base64", "overhead", "decode ms", "heap delta"],
  results.map((result) => [
    result.name,
    formatBytes(result.payloadBytes),
    formatBytes(result.base64Bytes),
    `${result.base64OverheadPercent.toFixed(1)}%`,
    formatMs(result.base64DecodeMs),
    result.base64DecodeHeapDelta === undefined ? "n/a" : formatBytes(result.base64DecodeHeapDelta)
  ])
);

console.log("");
console.log("Notes:");
console.log("- Timings are local medians and should be compared on the same machine.");
console.log(
  "- The deflate codec is script-local benchmark plumbing, not a built-in ByteDist codec."
);
console.log("- Heap deltas require running Node with --expose-gc.");

async function measureCase(testCase) {
  const files = createFiles(testCase);
  const inputBytes = files.reduce((total, file) => total + file.bytes.byteLength, 0);
  const createOptions = {
    files,
    integrity: "sha256",
    compression: testCase.compression,
    ...(testCase.compression === "none" ? {} : { compressionCodecs: [codec] })
  };
  const openOptions = testCase.compression === "none" ? {} : { compressionCodecs: [codec] };

  const packSamples = [];
  let payload = new Uint8Array();
  for (let index = 0; index < iterations; index += 1) {
    const measured = await measureAsync(() => createPayload(createOptions));
    packSamples.push(measured.ms);
    payload = measured.value;
  }

  const archive = await openPayload(payload, openOptions);
  const names = archive.list();
  const selectedChunk = names[Math.floor(names.length / 2)] ?? names[0];

  const openMs = median(
    await measureAsyncSamples(iterations, async () => {
      const opened = await openPayload(payload, openOptions);
      opened.close();
    })
  );
  const tocParseMs = median(measureSyncSamples(iterations, () => parseTocJson(payload)));
  const readOneMs = median(
    await measureAsyncSamples(iterations, async () => {
      await archive.readBytes(selectedChunk);
    })
  );
  const readAllMs = median(
    await measureAsyncSamples(iterations, async () => {
      for (const name of names) {
        await archive.readBytes(name);
      }
    })
  );
  const verifyMs = median(
    await measureAsyncSamples(iterations, async () => {
      await archive.verify();
    })
  );

  const base64 = encodeBase64(payload);
  const base64DecodeSamples = [];
  let base64DecodeHeapDelta;
  for (let index = 0; index < iterations; index += 1) {
    const measured = measureMemory(() => decodeBase64(base64));
    base64DecodeSamples.push(measured.ms);
    base64DecodeHeapDelta = measured.heapDelta;
  }

  archive.close();

  return {
    name: testCase.name,
    chunkCount: files.length,
    inputBytes,
    payloadBytes: payload.byteLength,
    packMs: median(packSamples),
    openMs,
    tocParseMs,
    readOneMs,
    readAllMs,
    verifyMs,
    base64Bytes: textEncoder.encode(base64).byteLength,
    base64OverheadPercent: (textEncoder.encode(base64).byteLength / payload.byteLength - 1) * 100,
    base64DecodeMs: median(base64DecodeSamples),
    base64DecodeHeapDelta
  };
}

function createFiles(testCase) {
  return Array.from({ length: testCase.count }, (_, index) => ({
    name: `assets/${String(index).padStart(6, "0")}.bin`,
    bytes: createBytes(testCase.size, index, testCase.pattern),
    mime: "application/octet-stream"
  }));
}

function createBytes(size, seed, pattern) {
  const bytes = new Uint8Array(size);

  for (let index = 0; index < bytes.byteLength; index += 1) {
    bytes[index] = pattern === "repeated" ? 65 + (seed % 4) : (seed * 31 + index * 17) % 256;
  }

  return bytes;
}

async function measureAsync(callback) {
  const start = performance.now();
  const value = await callback();
  return {
    value,
    ms: performance.now() - start
  };
}

async function measureAsyncSamples(count, callback) {
  const samples = [];

  for (let index = 0; index < count; index += 1) {
    samples.push((await measureAsync(callback)).ms);
  }

  return samples;
}

function measureSyncSamples(count, callback) {
  const samples = [];

  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    callback();
    samples.push(performance.now() - start);
  }

  return samples;
}

function measureMemory(callback) {
  if (typeof globalThis.gc !== "function") {
    const start = performance.now();
    callback();
    return {
      ms: performance.now() - start,
      heapDelta: undefined
    };
  }

  globalThis.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  callback();
  const ms = performance.now() - start;
  globalThis.gc();
  const heapAfter = process.memoryUsage().heapUsed;

  return {
    ms,
    heapDelta: Math.max(0, heapAfter - heapBefore)
  };
}

function parseTocJson(payload) {
  const footerOffset = payload.byteLength - 40;
  const view = new DataView(payload.buffer, payload.byteOffset + footerOffset, 40);
  const tocOffset = Number(view.getBigUint64(12, true));
  const tocLength = Number(view.getBigUint64(20, true));
  return JSON.parse(textDecoder.decode(payload.slice(tocOffset, tocOffset + tocLength)));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function printTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length))
  );

  console.log(headers.map((header, index) => header.padEnd(widths[index])).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));

  for (const row of rows) {
    console.log(row.map((cell, index) => cell.padEnd(widths[index])).join("  "));
  }
}

function formatMs(value) {
  return value.toFixed(value < 10 ? 3 : 2);
}

function formatBytes(value) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }

  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}
