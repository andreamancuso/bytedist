import { performance } from "node:perf_hooks";

const textEncoder = new TextEncoder();
const iterations = 200;

const cases = [
  {
    name: "small semantic",
    count: 12,
    nameFor: (index) => `assets/image-${String(index).padStart(3, "0")}.webp`,
    metadata: true
  },
  {
    name: "medium semantic",
    count: 250,
    nameFor: (index) => `media/gallery/${String(index).padStart(5, "0")}.bin`,
    metadata: true
  },
  {
    name: "medium opaque",
    count: 250,
    nameFor: (index) => `c/${fakeHash(index).slice(0, 32)}`,
    metadata: false
  },
  {
    name: "large semantic",
    count: 2_000,
    nameFor: (index) => `resources/chunk-${String(index).padStart(6, "0")}.dat`,
    metadata: false
  },
  {
    name: "large opaque",
    count: 2_000,
    nameFor: (index) => `c/${fakeHash(index)}`,
    metadata: false
  }
];

console.log("ByteDist TOC measurement");
console.log(`Iterations per timing: ${iterations}`);
console.log("");
console.log(
  [
    "case".padEnd(17),
    "chunks".padStart(7),
    "json bytes".padStart(12),
    "est binary".padStart(12),
    "json/bin".padStart(9),
    "parse ms".padStart(10),
    "stringify ms".padStart(12)
  ].join("  ")
);
console.log("-".repeat(89));

for (const testCase of cases) {
  const toc = createToc(testCase);
  const json = JSON.stringify(toc);
  const jsonBytes = textEncoder.encode(json).byteLength;
  const binaryBytes = estimateBinaryTocBytes(toc);
  const parseMs = median(measure(iterations, () => JSON.parse(json)));
  const stringifyMs = median(measure(iterations, () => JSON.stringify(toc)));

  console.log(
    [
      testCase.name.padEnd(17),
      String(testCase.count).padStart(7),
      formatNumber(jsonBytes).padStart(12),
      formatNumber(binaryBytes).padStart(12),
      (jsonBytes / binaryBytes).toFixed(2).padStart(9),
      parseMs.toFixed(3).padStart(10),
      stringifyMs.toFixed(3).padStart(12)
    ].join("  ")
  );
}

console.log("");
console.log("Notes:");
console.log("- Estimated binary size is a custom-record sketch, not a supported format.");
console.log("- JSON TOC remains the v0 encoding until measured costs justify added complexity.");

function createToc(testCase) {
  let offset = 24;
  const chunks = [];

  for (let index = 0; index < testCase.count; index += 1) {
    const length = 1024 + (index % 17);
    const name = testCase.nameFor(index);
    chunks.push({
      name,
      offset,
      length,
      storedLength: length,
      mime: "application/octet-stream",
      compression: "none",
      hash: {
        algorithm: "sha256",
        value: fakeHash(index)
      },
      ...(testCase.metadata
        ? {
            metadata: {
              role: index % 2 === 0 ? "preview" : "resource",
              ordinal: index
            }
          }
        : {})
    });
    offset += length;
  }

  return {
    version: 0,
    tocEncoding: "json",
    manifest: { path: "manifest.json" },
    chunks,
    metadata: { profile: testCase.name }
  };
}

function estimateBinaryTocBytes(toc) {
  let total = 24;

  total += estimateStringBytes(toc.manifest?.path ?? "");

  for (const chunk of toc.chunks) {
    total += 8 + 8 + 8;
    total += estimateStringBytes(chunk.name);
    total += estimateStringBytes(chunk.mime ?? "");
    total += estimateStringBytes(chunk.encoding ?? "");
    total += estimateStringBytes(chunk.compression);
    total += chunk.hash === undefined ? 1 : 1 + estimateStringBytes(chunk.hash.algorithm) + 32;
    total += chunk.metadata === undefined ? 4 : estimateStringBytes(JSON.stringify(chunk.metadata));
  }

  return total;
}

function estimateStringBytes(value) {
  return 4 + textEncoder.encode(value).byteLength;
}

function measure(count, callback) {
  const samples = [];

  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    callback();
    samples.push(performance.now() - start);
  }

  return samples;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function fakeHash(index) {
  return Array.from({ length: 64 }, (_, offset) => ((index + offset) % 16).toString(16)).join("");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}
