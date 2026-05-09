# ByteDist Roadmap

## Product Definition

ByteDist is an open-source toolkit for packaging arbitrary files and metadata
into portable web artifacts that can be read, verified, optionally decompressed,
and optionally embedded with a runtime into a single self-contained HTML file.

The library is app-agnostic. A host application owns its manifest schema and
resource model; ByteDist owns the packaging format, reading, verification,
embedding, and supporting tooling.

## Current Release

As of May 9, 2026, ByteDist is published on npm:

- package: [`bytedist`](https://www.npmjs.com/package/bytedist)
- version: `0.1.0-alpha.1`
- dist-tags: `alpha` and `latest`
- install: `npm install bytedist@alpha`
- package format: ESM-first npm package
- payload format: version `0`, still pre-1.0

The alpha is intended for dogfooding and early integration. Public APIs and
payload format details may still change before 1.0.

## What Is Done

The first public alpha includes:

- TypeScript writer and reference reader for `.bytedist` payloads.
- Versioned binary header/footer with footer-located JSON TOC.
- Safe chunk-name validation and reserved `.bytedist/*` namespace handling.
- `createPayload`, `openPayload`, list/has/read bytes/text/json APIs, and
  defensive read copies.
- SHA-256 chunk integrity verification, TOC CRC32 corruption checks, and
  whole-payload SHA-256 hashing.
- Detached provenance signatures using public-key verification.
- Optional caller-supplied compression codec plumbing, with `none` as the
  dependency-free default.
- Node helpers for directory packing, MIME detection, payload file writing, and
  internal extraction-safety primitives.
- CLI commands for `pack`, `inspect`, `verify`, `sign`, `verify-signature`, and
  `bundle-html`; public extraction remains deferred.
- Browser helpers for URL/blob/file loading, embedded payload reads, object URL
  lifecycle, and HTTP range loading.
- Single-file HTML payload and WASM embedding helpers using non-executable data
  blocks.
- Experimental WASM reader/validator wrapper with Emscripten build scripts.
- Optional Vite build plugin and framework-neutral examples.
- Docs for getting started, format, browser loading, single-file HTML, metadata,
  deterministic builds, signing, extraction safety, performance, compatibility,
  Vite, WASM, and security model.
- Release preparation with `CHANGELOG.md`, npm files allowlist, package dry-run,
  and local tarball smoke testing.

## Non-Goals And Security Boundary

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

## Near-Term Roadmap

### Stage 28: Downstream Feedback Loop

Goal: dogfood the live alpha in real downstream export workflows and feed generic
improvements back into ByteDist without leaking application-specific details.

Planned work:

- Integrate the published npm package into at least one downstream standalone
  HTML export path.
- Verify the downstream app can generate an application-specific manifest,
  package resources into a `.bytedist` payload, embed it into one HTML artifact,
  and open it offline.
- Confirm hardened outputs avoid obvious inline media data URLs and friendly
  resource filenames unless explicitly requested by the host application.
- Validate the WASM reader path in a standalone artifact where practical, with
  TypeScript reader behavior kept as the reference implementation.
- Record API friction as generic issues or roadmap notes before stabilizing 1.0
  APIs.
- Add one unrelated public demo only if dogfooding shows the current examples are
  not enough to prove generality.

Acceptance criteria:

- At least one downstream application successfully creates and opens a
  ByteDist-backed standalone artifact.
- Any reusable fixes land in ByteDist with generic names, docs, and tests.
- No application-specific schema, private product names, private paths, or
  private assets are committed to this repository.

### Stage 29: 0.2 Candidate Work

Likely follow-up work after dogfooding:

- Built-in gzip/deflate adapters, with zstd considered separately.
- WASM reader parity for compressed chunks.
- Automated browser smoke tests, likely focused on generated standalone HTML and
  range-loaded payloads.
- Browser memory/performance checks for embedded payloads.
- Better single-file HTML ergonomics if downstream integration exposes rough
  edges.
- Web Worker decoding helper if large payloads block the main thread.
- Public extraction CLI only after security-model language and extraction safety
  policy are mature.
- Binary TOC only if JSON TOC measurement or browser memory pressure justifies
  the added complexity.

Deferred unless clear demand appears:

- encryption APIs;
- service worker integration;
- framework-specific plugins beyond Vite;
- range loading in WASM;
- large compression ecosystems;
- signing policy beyond detached provenance envelopes.

### Stage 30: 1.0 Readiness

ByteDist should not reach 1.0 until:

- payload format compatibility policy is explicit;
- public APIs are stable enough for downstream integrations;
- CLI behavior is stable enough for scripts;
- browser, Node, and single-file HTML workflows are documented and tested;
- WASM reader behavior is either stable or clearly marked experimental;
- security model docs remain honest and visible;
- npm publish flow is repeatable;
- package contents are audited;
- at least one downstream application has dogfooded the package successfully;
- README and docs do not overpromise protection.

## Compatibility Posture

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
- expect embedded base64 payloads to require full decode and extra memory.

## Format Direction

Payload format version `0` is intentionally simple:

```text
Header
ChunkDataRegion
TocRegion
Footer
```

Current decisions:

- header magic: `BDISTPAY`;
- footer magic: `BDISTEND`;
- footer-located JSON TOC;
- safe path-like chunk names with forward slashes;
- optional SHA-256 chunk hashes;
- optional detached signatures outside the payload file;
- optional compression metadata with caller-supplied codecs;
- JSON TOC remains the only supported v0 TOC encoding.

Future format changes should preserve app-agnostic payload semantics and reject
unsupported versions clearly rather than guessing.

## Useful Commands

```sh
npm install bytedist@alpha
npx bytedist pack ./artifact --manifest manifest.json --out artifact.bytedist
npx bytedist inspect artifact.bytedist
npx bytedist verify artifact.bytedist
npx bytedist bundle-html --template index.html --payload artifact.bytedist --out artifact.html
```

Local repository checks:

```sh
npm run build
npm test
npm run typecheck
npm run format:check
npm pack --dry-run
```

Optional local checks:

```sh
npm run example:all
npm run wasm:test
npm run perf:baseline:quick
```

## Strategic Recommendation

Keep ByteDist focused on being a generic, boring, well-documented web artifact
packaging toolkit.

The next useful work is downstream dogfooding with the live npm package. Any
lessons from that work should be translated into generic ByteDist improvements:
better APIs, clearer docs, sharper error messages, stronger tests, and practical
browser/runtime guidance.
