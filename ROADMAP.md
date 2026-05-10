# ByteDist Roadmap

ByteDist is an open-source toolkit for packaging arbitrary files and metadata
into portable web artifacts that can be read, verified, optionally decompressed,
and optionally embedded with a runtime into a single self-contained HTML file.

The project is app-agnostic. Consumer applications own their manifest schemas,
resource models, and rendering logic. ByteDist owns the package format, reading,
verification, embedding helpers, and supporting tooling.

## Product Direction

ByteDist is intended to be a practical web artifact packaging toolkit:

- a versioned binary package format;
- TypeScript writer and reference reader APIs;
- browser and Node.js reading helpers;
- CLI tooling for packaging, inspection, verification, signing, and HTML
  bundling;
- optional single-file HTML embedding helpers;
- an experimental WASM reader/validator path for standalone artifacts.

ByteDist is not:

- DRM;
- encryption or anti-piracy technology;
- a tamper-proof package;
- a trusted execution environment;
- a general ZIP/TAR replacement;
- a package manager;
- a media transcoder.

Client-delivered artifacts contain the bytes and runtime needed to use them, so
determined users can extract assets. ByteDist can provide a cleaner packaging
boundary, integrity checks, provenance checks, and practical deterrence against
casual extraction. It must not be used to hide secrets, credentials, private
keys, hidden tokens, or server-only business rules.

WASM is a validation and friction layer, not a security boundary.

## Current Alpha Capabilities

The current alpha includes:

- TypeScript writer and reference reader for `.bytedist` packages.
- Versioned binary header/footer with footer-located JSON TOC.
- Safe chunk-name validation and reserved `.bytedist/*` namespace handling.
- `createPayload`, `openPayload`, list/has/read bytes/text/json APIs, and
  defensive read copies.
- SHA-256 chunk integrity verification, TOC CRC32 corruption checks, and
  whole-payload SHA-256 hashing.
- Detached provenance signatures using public-key verification.
- Optional caller-supplied compression codec plumbing, with `none` as the
  dependency-free default.
- Node helpers for directory packing, MIME detection, package file writing, and
  internal extraction-safety primitives.
- CLI commands for `pack`, `inspect`, `verify`, `sign`, `verify-signature`, and
  `bundle-html`.
- Browser helpers for URL/blob/file loading, embedded package reads, object URL
  lifecycle, and HTTP range loading.
- Single-file HTML package and WASM embedding helpers using non-executable data
  blocks.
- Experimental WASM reader/validator wrapper with Emscripten build scripts and
  vendored yyjson TOC parsing.
- Optional Vite build plugin and framework-neutral examples.
- Public docs for getting started, format, browser loading, single-file HTML,
  metadata, deterministic builds, signing, extraction safety, performance,
  compatibility, Vite, WASM, and the security model.

## Near-Term Priorities

The next work should focus on making the alpha easier to adopt and evaluate:

- Gather early integration feedback from real consumer applications and examples.
- Improve API ergonomics where packaging or standalone HTML workflows feel
  awkward.
- Validate generated single-file HTML artifacts across current major browsers.
- Strengthen automated browser smoke tests for embedded packages and range-loaded
  packages.
- Keep TypeScript reader behavior as the reference implementation while
  improving WASM reader parity.
- Document common integration patterns without coupling ByteDist to any
  particular framework or application model.
- Keep package contents audited before each alpha publish.

Success criteria:

- Consumer applications can generate application-specific manifests, package
  resources into `.bytedist` files, embed those packages into standalone HTML
  artifacts, and open them offline.
- Reusable improvements land with generic names, public docs, and tests.
- Public docs remain clear that ByteDist is packaging technology, not asset
  protection.

## Later Candidates

Likely follow-up work after more alpha feedback:

- Built-in gzip/deflate adapters, with zstd considered separately.
- WASM reader support for compressed chunks.
- Browser memory and performance checks for embedded packages.
- Better single-file HTML ergonomics if integration feedback exposes rough
  edges.
- Web Worker decoding helpers for large packages.
- Public extraction CLI only after security-model language and extraction safety
  policy are mature.
- Binary TOC only if JSON TOC measurements or browser memory pressure justify the
  added complexity.

Deferred unless clear demand appears:

- encryption APIs;
- service worker integration;
- framework-specific plugins beyond Vite;
- range loading in WASM;
- large compression ecosystems;
- signing policy beyond detached provenance envelopes.

## 1.0 Readiness

ByteDist should not reach 1.0 until:

- payload format compatibility policy is explicit;
- public APIs are stable enough for consumer integrations;
- CLI behavior is stable enough for scripts;
- browser, Node.js, and single-file HTML workflows are documented and tested;
- WASM reader behavior is either stable or clearly marked experimental;
- security model docs remain honest and visible;
- npm publish flow is repeatable;
- package contents are audited;
- at least one real consumer workflow has validated the package successfully;
- README and docs do not overpromise protection.

## Compatibility And Format Notes

Current targets:

- Node.js `>=20`;
- modern Chromium, Edge, Firefox, Safari, and iOS Safari where practical;
- ESM-capable bundlers;
- Vite as the first tested bundler integration;
- no-bundler single-file HTML examples.

Conservative browser assumptions:

- use `WebAssembly.instantiate(bytes, imports)` for embedded WASM;
- do not require service workers;
- do not require network access for standalone artifacts;
- do not rely exclusively on WebCrypto for `file://` standalone startup;
- expect embedded base64 packages to require full decode and extra memory.

Payload format version `0` is intentionally simple:

```text
Header
ChunkDataRegion
TocRegion
Footer
```

Current format decisions:

- header magic: `BDISTPAY`;
- footer magic: `BDISTEND`;
- footer-located JSON TOC;
- safe path-like chunk names with forward slashes;
- optional SHA-256 chunk hashes;
- optional detached signatures outside the package file;
- optional compression metadata with caller-supplied codecs;
- JSON TOC remains the only supported v0 TOC encoding.

Future format changes should preserve app-agnostic package semantics and reject
unsupported versions clearly rather than guessing.


