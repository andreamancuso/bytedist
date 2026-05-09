# Performance Baseline

ByteDist performance depends on payload shape, hardware, Node version, browser,
compression adapters, and whether the payload is embedded in a single HTML file
or loaded externally. The repository therefore ships repeatable local benchmark
tooling instead of committed machine-specific numbers.

## Running Benchmarks

Run a quick smoke benchmark:

```sh
npm run perf:baseline:quick
```

Run the fuller local baseline:

```sh
npm run perf:baseline
```

Both commands build the package first and then run
`scripts/measure-performance.mjs` against `dist`. The script prints local median
timings for:

- packing generated fixture files;
- opening payloads;
- JSON TOC parse cost;
- reading one selected chunk;
- reading every chunk;
- SHA-256 verification;
- base64 encoded size and decode cost for single-file HTML style embedding.

The benchmark includes uncompressed cases and compression-adapter cases. The
compression adapter uses Node's built-in zlib APIs inside the benchmark script;
it is not a built-in ByteDist runtime codec.

## Memory Notes

Single-file HTML embedding stores payload bytes as base64 text. Base64 normally
adds about one third to the encoded payload size before HTML, script, and runtime
overhead. Opening an embedded payload also requires decoding that base64 text
back to bytes before the reader can inspect the footer and TOC.

The benchmark reports heap deltas only when Node exposes `global.gc`. To enable
that manually:

```sh
npm run build
node --expose-gc scripts/measure-performance.mjs
```

Node heap deltas are useful for relative local comparison, but they are not a
browser memory guarantee. Browser memory behavior depends on implementation
details, mobile constraints, media decoding, object URL lifetimes, and whether
the artifact is embedded or externally loaded.

## Practical Guidance

Use these as starting points, not hard limits:

- Small payloads up to a few MiB are usually reasonable candidates for
  single-file HTML.
- Medium payloads in the tens of MiB should be measured with the target browser,
  especially Safari and mobile browsers.
- Large payloads should prefer external `.bytedist` files and range loading
  where hosting allows it.
- Many small chunks increase TOC size and per-chunk overhead; fewer larger
  chunks reduce metadata overhead but can make selective reads less precise.
- SHA-256 verification reads every chunk. It is valuable for integrity checks,
  but it should be measured for startup-sensitive workflows.
- Compression can reduce payload and base64 size for repetitive data, but codec
  cost and browser availability are caller-owned until built-in codecs exist.

For hosted artifacts, `openPayloadFromUrlRange` can avoid reading every byte at
startup. Embedded payloads are full-decode by design.

## Interpreting Results

Compare results only on the same machine and runtime. For project decisions,
record:

- command used;
- Node version;
- operating system;
- ByteDist commit;
- payload shape and approximate size;
- whether compression was enabled.

Do not treat one local benchmark run as a release promise. Use the benchmark to
detect large regressions and to choose between embedded, external, compressed,
and range-loaded artifact shapes.
