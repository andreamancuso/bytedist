# Roadmap: Generic WASM-Friendly Binary Payload Toolkit

## One-Sentence Product Definition

ByteDist is an open-source toolkit for packing arbitrary files and metadata into a versioned binary payload that can be read, verified, optionally decompressed, and optionally embedded with a runtime into a single self-contained HTML artifact.

## Longer Product Definition

ByteDist provides a generic binary asset container for offline-capable web artifacts. It is designed for browser-based editors, interactive documents, local-first apps, visualizations, games, kiosks, demos, and static exports that want a cleaner packaging boundary than loose files, huge inline JSON, or visible base64 media blobs.

The library should not be application-specific. Any host application should be able to use ByteDist by producing an application-specific manifest and a set of binary/text assets.

## Core Idea

```text
input files + manifest
  -> packer
  -> .bytedist binary file
  -> runtime reader / WASM decoder for hardened standalone artifacts
  -> application viewer
```

Optional single-file mode:

```text
HTML template + viewer JS + WASM decoder + .bytedist
  -> single self-contained HTML file
```

## Current Progress

As of May 8, 2026, the repository has completed the framing and setup work plus the first writer and reader implementation slices:

- Stage 0 project framing is complete in `README.md`, with generic product language, target audience, license, and explicit no-DRM/no-secrets language.
- Stage 1 repository setup is complete with npm package metadata, TypeScript, Vitest, Prettier, declaration-emitting build, package dry-run support, and GitHub Actions CI.
- Stage 2 format constants and types are complete enough for the next implementation slice:
  - payload header magic is `BDISTPAY`;
  - footer magic is `BDISTEND`;
  - payload format version is `0`;
  - public TypeScript types, format validation helpers, and error classes are exported from `src/index.ts`;
  - tests cover valid/invalid magic bytes, unsupported versions, and error identity.
- Stage 3 minimal in-memory payload writer is complete:
  - `createPayload` writes header, chunk data, JSON TOC, and footer into a `Uint8Array`;
  - generated manifests are written as `manifest.json`;
  - empty chunks are supported;
  - duplicate and unsafe chunk names are rejected;
  - optional per-chunk SHA-256 hash metadata is emitted when requested.
- Stage 4 minimal reader is complete:
  - `openPayload` validates header, footer, TOC shape, chunk names, chunk ranges, and unsupported compression;
  - archive objects expose `list`, `has`, `getToc`, `readBytes`, `readText`, `readJson`, and `close`;
  - `readBytes` returns defensive copies;
  - `verify` throws a typed unsupported-feature error until Stage 5.

The full integrity verification API, CLI commands, browser runtime, HTML bundler, and WASM reader are still future work.

## Important Product Language

ByteDist should be described as:

- a binary payload format;
- an asset-packaging toolkit;
- a self-contained web artifact helper;
- a runtime-readable package format;
- a practical deterrence layer against casual extraction;
- a clean packaging boundary.

ByteDist should **not** be described as:

- DRM;
- secure content protection;
- anti-piracy technology;
- encrypted publishing;
- tamper-proof packaging;
- a trusted execution environment.

## Assumptions

1. The first target ecosystem is TypeScript/JavaScript.
2. The first package manager target is npm.
3. The first runtime targets are Node.js and modern browsers.
4. The first bundler target is Vite, but the core should not depend on Vite.
5. The first use case is static export packaging for local-first web apps.
6. The binary payload format must be app-agnostic.
7. The payload may contain arbitrary named resources, not just images or media.
8. The payload may contain an application-defined manifest.
9. ByteDist should support both external payload files and embedded payloads.
10. Single-file HTML export is a first-class goal, not an afterthought.
11. Base64 embedding is acceptable for portability, despite size overhead.
12. The project should begin with a TypeScript packer and reference reader, then add a narrow WASM reader before the host-application MVP is considered usable.
13. WASM should be a validation and deterrence layer for hardened standalone artifacts, not a security boundary.
14. Compression should be optional per payload or per chunk.
15. Integrity checking should be supported from the beginning.
16. Cryptographic signing can be added later.
17. The format must be explicitly versioned from day one.
18. The package should expose a narrow, stable public API.
19. The CLI should be useful even without any application integration.
20. The project should include examples that prove it is generic.
21. A private host application may dogfood ByteDist, but its domain model must not leak into the core repository.
22. The library must work without a server.
23. The library must not assume React, Three.js, WebGPU, WebGL, or any rendering stack.
24. The library must support binary resources efficiently.
25. The library should avoid loading huge resources unnecessarily when possible.
26. The initial implementation may load the full payload into memory.
27. Streaming and random-access optimizations can come later.
28. The project should have a simple format-inspection story.
29. The project should have a stable test corpus of sample payloads.
30. The project should be documented well enough that other projects can adopt it without reading the source.

## Non-Goals

1. Do not build DRM.
2. Do not claim exported assets are impossible to extract.
3. Do not build a general archive replacement for ZIP or TAR.
4. Do not build a package manager.
5. Do not build a full virtual filesystem unless needed later.
6. Do not couple the format to Emscripten MEMFS.
7. Do not require WebAssembly for all consumers.
8. Do not require a server.
9. Do not require service workers.
10. Do not require Vite.
11. Do not require TypeScript consumers to use a specific framework.
12. Do not define application-specific schemas in the core.
13. Do not build a media transcoder in v1.
14. Do not solve asset licensing policy.
15. Do not solve paid publishing, authentication, or access control.
16. Do not hide secrets in client-side bundles.
17. Do not optimize prematurely for multi-gigabyte payloads.
18. Do not attempt to replace glTF, KTX2, FlatBuffers, Protobuf, or similar specialized formats.
19. Do not invent custom cryptography.
20. Do not block basic adoption behind an elaborate WASM build pipeline.

## High-Level Architecture

```text
packages/
  payload-format/
    Format constants, binary layout definitions, type declarations.

  payload-core/
    TypeScript packer and reader.

  payload-node/
    Node.js filesystem helpers and CLI support.

  payload-browser/
    Browser-friendly loader, embedded blob extraction, fetch helpers.

  payload-html/
    Single-file HTML embedding and extraction helpers.

  payload-cli/
    Command-line tools for pack, inspect, verify, and bundle-html. Public extraction is post-MVP.

  payload-wasm/
    Optional WASM decoder/validator implementation.

  payload-vite/
    Optional Vite plugin.

examples/
  simple-gallery/
  offline-map/
  interactive-document/
  wasm-decoder-demo/
  single-file-html-demo/

docs/
  format.md
  api.md
  cli.md
  browser.md
  single-file-html.md
  security-model.md
  integrations.md
```

The monorepo package split can be simplified at first. It is acceptable to start with fewer packages and split later.

## Suggested First Repository Shape

For the first practical implementation, start smaller:

```text
bytedist/
  package.json
  tsconfig.json
  README.md
  ROADMAP.md
  SECURITY.md
  LICENSE

  src/
    format/
      constants.ts
      types.ts
      errors.ts

    core/
      pack.ts
      read.ts
      verify.ts
      toc.ts
      chunks.ts
      encoding.ts

    node/
      packFiles.ts
      writePayload.ts
      readPayloadFile.ts

    browser/
      loadPayload.ts
      embedded.ts

    html/
      embedHtml.ts
      extractEmbedded.ts

    cli/
      index.ts
      commands/
        pack.ts
        inspect.ts
        verify.ts
        extract.ts        # post-MVP public command; internal test helpers may exist earlier
        bundleHtml.ts

  test/
    fixtures/
    unit/
    integration/

  examples/
    basic/
    single-file-html/
```

Then split into packages only after the API stabilizes.

## Proposed File Extension

Use a neutral extension for generic payloads.

Candidates:

- `.webpkg`
- `.bytedist`
- `.wpayload`
- `.artifact`
- `.pkit`
- `.packfile`

Avoid:

- application-specific extensions, because ByteDist should stay generic;
- `.pak`, because it is overloaded;
- `.bundle`, because it collides conceptually with JS bundlers;
- `.wbn`, because that implies Web Bundles;
- `.zip`, because this is not a ZIP archive;
- `.wasm`, because the payload is not a WASM module.

This roadmap uses `.bytedist` as a placeholder.

## Proposed Binary Format v0

The first version should be intentionally simple.

```text
PayloadFile
  Header
  ChunkDataRegion
  TocRegion
  Footer
```

Footer-last TOC is useful because the writer can stream chunk data first and write the table of contents at the end. The reader can inspect the footer, locate the TOC, then index chunks.

### Header v0

```text
magic:          8 bytes   "BDISTPAY"
formatVersion: u32
headerLength:  u32
flags:         u32
reserved:      bytes
```

### Footer v0

```text
footerMagic:      8 bytes   "BDISTEND"
formatVersion:   u32
tocOffset:       u64
tocLength:       u64
payloadLength:   u64
footerChecksum:  bytes or u32 initially
```

### TOC v0

The TOC can start as JSON for speed of development, then move to a binary schema later.

```json
{
  "version": 0,
  "createdBy": "bytedist/0.1.0",
  "manifest": {
    "path": "manifest.json"
  },
  "chunks": [
    {
      "name": "manifest.json",
      "offset": 64,
      "length": 1234,
      "storedLength": 789,
      "mime": "application/json",
      "encoding": "utf-8",
      "compression": "none",
      "hash": {
        "algorithm": "sha256",
        "value": "..."
      },
      "metadata": {}
    }
  ]
}
```

A JSON TOC is not the final performance target, but it makes v0 much easier to inspect, test, and debug.

### Chunk Naming Rules

Chunk names should be path-like but not actual filesystem paths.

Rules:

1. Use forward slashes.
2. No absolute paths.
3. No drive letters.
4. No `..` traversal.
5. No empty segments.
6. No leading slash.
7. UTF-8 names allowed, but normalize consistently.
8. Names must be unique.
9. Names should be case-sensitive.
10. Reserved names should be documented.

Examples:

```text
manifest.json
assets/image-001.webp
assets/audio/intro.mp3
geometry/walls.bin
metadata/license.json
```

## Public API v0

### Packer API

```ts
const payload = await createPayload({
  manifest: {
    title: "Example",
    version: 1
  },
  files: [
    {
      name: "scene.json",
      bytes: sceneBytes,
      mime: "application/json"
    },
    {
      name: "assets/image.webp",
      bytes: imageBytes,
      mime: "image/webp"
    }
  ],
  integrity: "sha256",
  compression: "none"
});
```

### Reader API

```ts
const archive = await openPayload(payloadBytes);

const toc = archive.getToc();
const names = archive.list();
const scene = await archive.readJson("scene.json");
const image = await archive.readBytes("assets/image.webp");

await archive.verify();
```

### HTML Embedding API

```ts
const html = await createSingleFileHtml({
  templateHtml,
  payloadBytes,
  runtimeJs,
  wasmBytes
});
```

### Embedded Runtime API

```ts
const payloadBytes = await readEmbeddedPayload({
  selector: "script[data-bytedist-payload]"
});

const archive = await openPayload(payloadBytes);
```

## CLI v0

The CLI should be useful from day one.

```sh
bytedist pack ./input-dir --manifest manifest.json --out demo.bytedist
bytedist inspect demo.bytedist
bytedist verify demo.bytedist
bytedist bundle-html --template template.html --payload demo.bytedist --out demo.html
```

Optional later:

```sh
bytedist extract demo.bytedist --out ./extracted
bytedist serve demo.bytedist
bytedist diff a.bytedist b.bytedist
bytedist list demo.bytedist
bytedist hash demo.bytedist
bytedist sign demo.bytedist --key private.key
bytedist verify-signature demo.bytedist --key public.key
```

## Security Model

A dedicated `SECURITY.md` or `docs/security-model.md` is mandatory.

It should state:

1. ByteDist is not DRM.
2. ByteDist does not prevent extraction by a determined user.
3. ByteDist does not hide secrets in client-side code.
4. ByteDist integrity checks detect corruption or tampering only when the verifier is trusted.
5. ByteDist signatures can prove provenance only if the public key and trust model are managed correctly.
6. ByteDist can make casual extraction less convenient.
7. ByteDist can help avoid accidental exposure of raw files.
8. ByteDist can enforce a clean packaging boundary.
9. ByteDist should not be used to store credentials, private keys, or licensed secrets in browser-delivered artifacts.
10. Applications must sanitize their own data before packing.

## First MVP: Host-Application Standalone HTML Hardening

The first useful milestone is not just a generic archive. It is a host-application-ready pipeline for producing a single self-contained HTML artifact whose embedded resources are packaged behind a binary payload boundary.

The MVP is accepted when a host application can build a parallel standalone HTML export that:

1. embeds one ByteDist payload inside the HTML;
2. opens directly from disk without a server;
3. reads its application manifest and binary resources at runtime;
4. avoids obvious inline media base64 blobs in the HTML source;
5. avoids friendly asset filenames in hardened payloads;
6. verifies payload integrity before or during runtime use;
7. uses the WASM reader/validator path for the hardened browser runtime;
8. keeps the TypeScript reader as the reference implementation and fallback where appropriate;
9. documents clearly that the artifact is still extractable by a determined user;
10. keeps all host-application semantics outside ByteDist core.

This MVP should be built as a parallel export path in the consuming application first. It should not replace the host application's existing export path until the generated artifact opens offline, loads media reliably, reports corruption clearly, and has acceptable size/performance characteristics.

## Deterrence Profile

ByteDist should define a hardened profile for host applications that want practical deterrence against casual extraction while staying honest about the limits of client-delivered artifacts.

The deterrence profile should include:

- opaque chunk IDs by default, such as content hashes or generated stable IDs;
- no friendly artwork, media, source, or user filenames in hardened artifacts unless the application explicitly opts in;
- a minimized application manifest that maps runtime IDs to resources without exposing unnecessary source metadata;
- a public manifest split from any internal build metadata;
- SHA-256 chunk hashes and payload verification;
- embedded payload bytes stored outside executable JavaScript;
- a WASM reader/validator path for hardened standalone HTML artifacts;
- on-demand chunk reads instead of eagerly materializing every resource;
- object URL lifecycle guidance for image, audio, and other media resources;
- no client-side secrets, private keys, license secrets, or claims that the artifact is uncrackable.

The TypeScript reader can support the same payloads for tests, tooling, and non-hardened applications, but host-application hardening should prove the WASM path before the MVP is considered ready.

## MVP Stage Order

The roadmap below remains the long-term implementation plan, but the first MVP should prioritize these slices:

1. Project setup, package metadata, test runner, build, and security docs.
2. Versioned payload format, safe chunk names, JSON TOC, footer lookup, and TypeScript pack/read APIs.
3. Integrity support, including per-chunk SHA-256 and TOC/payload verification.
4. Opaque chunk IDs and minimized-manifest conventions for hardened artifacts.
5. Browser embedded-payload reader and single-file HTML embedding helper.
6. CLI commands for `pack`, `inspect`, `verify`, and `bundle-html`.
7. Narrow WASM reader/validator with a JS wrapper and embedded WASM loader.
8. Host-application integration recipe for a parallel standalone HTML export path.
9. Browser demo and private dogfooding against at least one host application.
10. Performance, compatibility, and release-readiness polish.

Public `extract` is deliberately not part of the first MVP. Extraction helpers may exist internally for tests and fixture inspection, but a public extraction command should wait until ByteDist's packaging and deterrence language is mature.

## Stage 0: Project Framing

Status: Complete.

Implemented in:

- `README.md`
- `LICENSE`
- `SECURITY.md`

### 0.1 Define the Generic Problem

Write a short project brief explaining what the library is and is not.

Acceptance criteria:

- The brief does not mention any private host application as the core use case.
- The brief includes at least three generic use cases.
- The brief explicitly says the project is not DRM.

Progress:

- Complete. `README.md` defines ByteDist generically and names static exports, interactive documents, kiosk/demo/game/visualization/training artifacts, browser-based editors, and local-first applications as generic use cases.

### 0.2 Choose a Working Name

Pick a temporary package and repository name.

Acceptance criteria:

- The name is usable in source code examples.
- The name does not make security claims.
- The name does not collide obviously with Web Bundles or WASM itself.

Progress:

- Complete. The package name is `bytedist`.

### 0.3 Pick a License

Recommended default: MIT or Apache-2.0.

Acceptance criteria:

- `LICENSE` exists.
- README states the license.
- Any third-party dependencies are compatible.

Progress:

- Complete. The repository uses MIT.

### 0.4 Define Initial Audience

Document the target users:

- browser-based app authors;
- local-first tool authors;
- static export generators;
- interactive document builders;
- kiosk/offline web app authors;
- web game/demo authors.

Acceptance criteria:

- README has a short “Who is this for?” section.

Progress:

- Complete. `README.md` includes a “Who Is This For?” section.

## Stage 1: Repository Setup

Status: Complete.

Implemented in:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `vitest.config.ts`
- `.prettierrc.json`
- `.prettierignore`
- `.github/workflows/ci.yml`
- `src/index.ts`
- `src/index.test.ts`

### 1.1 Initialize TypeScript Project

Set up package scripts, TypeScript config, linting, and tests.

Acceptance criteria:

- `npm install` works.
- `npm test` works.
- `npm run build` works.
- TypeScript emits type declarations.

Progress:

- Complete. The package has TypeScript, Vitest, build and typecheck scripts, and declaration output.

### 1.2 Add Basic CI

Add GitHub Actions or similar.

Acceptance criteria:

- CI runs install, build, and tests.
- CI runs on pull requests.
- CI runs on main branch pushes.

Progress:

- Complete. GitHub Actions runs install, typecheck, tests, build, formatting check, and package dry-run on pull requests and `main` pushes.

### 1.3 Add Formatting

Add Prettier or equivalent.

Acceptance criteria:

- `npm run format` exists.
- `npm run format:check` exists.

Progress:

- Complete. Prettier scripts are configured.

### 1.4 Add Package Metadata

Fill package name, description, repository, keywords, exports, and files.

Acceptance criteria:

- Package is publishable to npm in principle.
- Package uses ESM first unless there is a strong reason not to.
- Types are exported.

Progress:

- Complete. The package is ESM-first, exports `dist/index.js` and `dist/index.d.ts`, includes repository metadata, and validates package contents with `npm pack --dry-run`.

## Stage 2: Format Constants and Types

Status: Complete for the constant/type/error surface. Reader and writer behavior remains future work.

Implemented in:

- `src/format/constants.ts`
- `src/format/types.ts`
- `src/format/errors.ts`
- `src/format/validation.ts`
- `src/format/index.ts`
- `src/index.ts`
- `src/index.test.ts`

### 2.1 Define Magic Bytes

Define a fixed magic byte sequence for payload files.

Acceptance criteria:

- Magic bytes are documented.
- Reader rejects files without the magic bytes.
- Tests cover valid and invalid magic bytes.

Progress:

- Complete for Stage 2. The exported header magic is `BDISTPAY`; the exported footer magic is `BDISTEND`.
- Pure validation helpers reject invalid or short magic byte arrays. The future reader should call these helpers when Stage 4 implements `openPayload`.

### 2.2 Define Versioning

Add a format version constant.

Acceptance criteria:

- Version is stored in payloads.
- Reader rejects unsupported future major versions.
- Tests cover unsupported versions.

Progress:

- Complete for Stage 2. The exported payload format version is `0`.
- Pure validation helpers reject unsupported versions. The future writer will store this value, and the future reader will call these helpers.

### 2.3 Define Core Types

Create TypeScript types for:

- payload options;
- file inputs;
- chunk records;
- TOC;
- integrity algorithms;
- compression algorithms;
- opened payload object;
- errors.

Acceptance criteria:

- Public types are exported.
- Internal-only types are not accidentally exported.

Progress:

- Complete. Public types cover payload creation options, file inputs, chunk records, TOC shape, integrity and compression algorithms, JSON values, and the planned opened-payload reader interface.

### 2.4 Define Error Classes

Create specific errors:

- `PayloadFormatError`
- `PayloadVersionError`
- `PayloadIntegrityError`
- `PayloadChunkNotFoundError`
- `PayloadCompressionError`
- `PayloadEmbeddingError`

Acceptance criteria:

- Errors include useful messages.
- Tests assert error types, not just messages.

Progress:

- Complete. `ByteDistError` and payload-specific error classes are exported and covered by tests.

## Stage 3: Minimal In-Memory Payload Writer

Status: Complete.

Implemented in:

- `src/core/pack.ts`
- `src/core/layout.ts`
- `src/core/hash.ts`
- `src/core/index.ts`
- `src/core/pack.test.ts`
- `src/format/validation.ts`

### 3.1 Write Header

Implement binary header writing.

Acceptance criteria:

- Header contains magic, version, header length, and flags.
- Header can be parsed independently.

Progress:

- Complete. The writer emits a 24-byte little-endian header with `BDISTPAY`, version `0`, header length `24`, flags `0`, and reserved `0`.

### 3.2 Write Chunk Data

Implement appending named chunks to an in-memory payload.

Acceptance criteria:

- Multiple chunks can be written.
- Empty chunks are either supported or rejected explicitly.
- Duplicate names are rejected.

Progress:

- Complete. Multiple chunks are written in order, empty chunks are supported, duplicate names are rejected, and unsafe names are rejected.

### 3.3 Write JSON TOC

Implement a v0 JSON TOC placed near the end of the file.

Acceptance criteria:

- TOC includes chunk names, offsets, lengths, MIME types, compression flags, and hashes if enabled.
- TOC can be found using the footer.

Progress:

- Complete. The writer emits JSON TOC v0 before the footer, including chunk offsets, lengths, stored lengths, MIME, encoding, compression, metadata, and optional SHA-256 hash records.

### 3.4 Write Footer

Implement footer with TOC offset and length.

Acceptance criteria:

- Reader can locate the TOC from the footer.
- Tests cover corrupted footer scenarios.

Progress:

- Complete for writer output. The writer emits a 40-byte little-endian footer with `BDISTEND`, version `0`, TOC offset, TOC length, payload length, and reserved checksum `0`.
- Tests inspect the footer and cover corrupted footer magic with the format helper. Full reader offset validation remains Stage 4.

### 3.5 Create `createPayload`

Expose the first public packer API.

Acceptance criteria:

- A caller can pass a manifest and files.
- The function returns `Uint8Array` or `ArrayBuffer`.
- Unit tests create valid sample payloads.

Progress:

- Complete. `createPayload` accepts a manifest and files, generates `manifest.json` when requested, returns `Uint8Array`, and is covered by unit tests.

## Stage 4: Minimal Reader

Status: Complete.

Implemented in:

- `src/core/read.ts`
- `src/core/read.test.ts`
- `src/core/index.ts`
- `src/format/errors.ts`

### 4.1 Parse Header

Implement header parser.

Acceptance criteria:

- Header parser validates magic/version.
- Header parser returns useful metadata.

Progress:

- Complete. The reader validates `BDISTPAY`, version `0`, header length, flags, and reserved fields.

### 4.2 Parse Footer

Implement footer parser.

Acceptance criteria:

- Footer parser locates TOC.
- Footer parser detects invalid offsets.

Progress:

- Complete. The reader validates `BDISTEND`, version `0`, payload length, checksum placeholder, TOC offset, and TOC length.

### 4.3 Parse TOC

Implement JSON TOC parsing.

Acceptance criteria:

- TOC is parsed into typed records.
- TOC chunk offsets are validated.
- Invalid JSON fails cleanly.

Progress:

- Complete. JSON TOC parsing validates TOC shape, duplicate and unsafe chunk names, chunk ranges, unsupported compression, and stored/logical length mismatches.

### 4.4 Open Payload

Expose `openPayload(bytes)`.

Acceptance criteria:

- It returns an archive-like object.
- It supports `list()`.
- It supports `has(name)`.
- It supports `getToc()`.

Progress:

- Complete. `openPayload(bytes)` returns a promise for an archive-like object with `list`, `has`, and defensive `getToc`.

### 4.5 Read Bytes

Implement `readBytes(name)`.

Acceptance criteria:

- Reads exact chunk bytes.
- Throws `PayloadChunkNotFoundError` for missing chunks.
- Tests cover multiple chunks.

Progress:

- Complete. `readBytes` returns exact defensive byte copies and throws `PayloadChunkNotFoundError` for missing chunks.

### 4.6 Read Text and JSON

Implement `readText(name)` and `readJson(name)`.

Acceptance criteria:

- UTF-8 decoding works.
- JSON parse errors are useful.
- Tests cover normal and invalid JSON.

Progress:

- Complete. `readText` uses UTF-8 decoding, and `readJson` wraps parse failures in `PayloadFormatError`.

## Stage 5: Integrity Support

### 5.1 Add SHA-256 Hashing

Use Web Crypto in browser and Node crypto in Node, or use a small cross-runtime abstraction.

Acceptance criteria:

- Writer can store SHA-256 per chunk.
- Reader can verify per chunk.
- Full payload verification works.

### 5.2 Add `verify()`

Expose `archive.verify()`.

Acceptance criteria:

- Verification passes for valid payloads.
- Verification fails for modified chunk data.
- Verification reports the failing chunk name.

### 5.3 Add Optional Hashless Mode

Allow integrity checks to be disabled for minimal payloads.

Acceptance criteria:

- Hashless payloads can be written and read.
- `verify()` clearly reports that no integrity metadata exists or treats it as a no-op by design.

### 5.4 Add TOC Integrity

Add hash/integrity for the TOC itself.

Acceptance criteria:

- Corrupted TOC is detected where possible.
- Tests modify TOC bytes and expect failure.

## Stage 6: Node Filesystem Helpers

### 6.1 Pack Directory

Implement `packDirectory(inputDir, options)`.

Acceptance criteria:

- Recursively collects files.
- Applies ignore patterns.
- Normalizes chunk names.
- Rejects unsafe paths.

### 6.2 Manifest File Support

Allow a manifest JSON file to be included specially.

Acceptance criteria:

- CLI and API can designate a manifest path.
- Manifest is stored under a predictable name by default.

### 6.3 MIME Detection

Add basic MIME type detection.

Acceptance criteria:

- Common extensions map to useful MIME types.
- Unknown files default to `application/octet-stream`.

### 6.4 Write Payload File

Implement `writePayloadFile(path, bytes)` and related helpers.

Acceptance criteria:

- CLI can write output file.
- Existing files require explicit overwrite or are overwritten by documented behavior.

## Stage 7: CLI v0

### 7.1 CLI Entrypoint

Create `bytedist` binary.

Acceptance criteria:

- `bytedist --help` works.
- Unknown commands fail with a clear message.

### 7.2 `pack` Command

Implement:

```sh
bytedist pack ./input --out demo.bytedist
```

Acceptance criteria:

- Packs a directory.
- Supports manifest path.
- Supports output path.
- Prints summary.

### 7.3 `inspect` Command

Implement:

```sh
bytedist inspect demo.bytedist
```

Acceptance criteria:

- Prints format version.
- Prints chunk count.
- Prints total size.
- Lists chunks with size, MIME, compression, and hash status.

### 7.4 `verify` Command

Implement:

```sh
bytedist verify demo.bytedist
```

Acceptance criteria:

- Exits 0 for valid payload.
- Exits nonzero for invalid payload.
- Reports failing chunks.

### 7.5 Defer Public `extract`

Do not expose a public extraction command in the first MVP.

Internal extraction helpers may exist for tests and fixture inspection, but they should not be advertised as part of the first public CLI surface.

Acceptance criteria:

- `bytedist --help` does not list `extract` for the MVP.
- Tests can still inspect fixture contents without a public extraction command.
- Documentation explains that public extraction tooling is post-MVP.

### 7.6 CLI Tests

Add integration tests for CLI commands.

Acceptance criteria:

- Tests run in CI.
- Tests do not require global installation.

## Stage 8: Browser Loader

### 8.1 Browser-Compatible Reader

Ensure `openPayload` works in browser environments.

Acceptance criteria:

- No Node-only imports in browser path.
- Browser tests or demo prove loading works.

### 8.2 Fetch Loader

Implement:

```ts
const archive = await loadPayloadFromUrl("demo.bytedist");
```

Acceptance criteria:

- Fetches payload as ArrayBuffer.
- Opens the payload.
- Reports HTTP/load failures clearly.

### 8.3 Blob/File Loader

Implement browser `File` and `Blob` loading helpers.

Acceptance criteria:

- Works with file input elements.
- Works with drag-and-drop files.

### 8.4 Object URL Helper

Optionally expose a helper to read bytes and create object URLs for media.

Acceptance criteria:

- Image/audio demo can display resources from payload.
- Object URLs can be revoked.

## Stage 9: Single-File HTML Embedding

### 9.1 Define Embedding Strategy

Use script tags with non-JS MIME types.

Example:

```html
<script type="application/octet-stream+base64" data-bytedist-payload>
BASE64...
</script>
```

Acceptance criteria:

- Strategy is documented.
- It works without external files.
- It does not execute embedded payload content.

### 9.2 Base64 Encode Helper

Implement robust base64 encoding for Node and browser.

Acceptance criteria:

- Large payloads can be encoded.
- Tests cover binary data, not just text.

### 9.3 Base64 Decode Helper

Implement browser-safe decoding to `Uint8Array`.

Acceptance criteria:

- Handles whitespace/newlines.
- Throws useful errors on invalid base64.

### 9.4 `embedPayloadInHtml`

Implement function that injects payload into an HTML template.

Acceptance criteria:

- Inserts payload at a configurable marker.
- Fails clearly if marker is missing.
- Supports minified or multiline output.

### 9.5 `readEmbeddedPayload`

Implement browser runtime extraction.

Acceptance criteria:

- Finds embedded payload by selector.
- Decodes bytes.
- Opens the archive.

### 9.6 Single-File Demo

Build a demo that loads a payload embedded in its own HTML.

Acceptance criteria:

- Demo can be opened directly from disk.
- Demo displays at least one text asset and one image asset.
- No server is required.
- Demo does not expose friendly media filenames or raw media data URLs in the HTML source when using the deterrence profile.

## Stage 10: HTML Bundler CLI

### 10.1 `bundle-html` Command

Implement:

```sh
bytedist bundle-html \
  --template template.html \
  --payload demo.bytedist \
  --out demo.html
```

Acceptance criteria:

- Produces one HTML file.
- Embedded payload can be read by browser runtime.
- CLI prints original and final size.

### 10.2 Runtime JS Injection

Optionally allow injecting small runtime JS.

Acceptance criteria:

- Template marker can receive runtime script.
- User can disable injection.

### 10.3 WASM Embedding Placeholder

Support embedding arbitrary WASM bytes generically as a prerequisite for the hardened runtime.

Acceptance criteria:

- CLI accepts `--wasm viewer.wasm`.
- HTML includes a separate WASM script tag or data block.
- Browser helper can decode embedded WASM bytes.

### 10.4 Hardened HTML Profile

Add an option or documented recipe for creating a deterrence-profile HTML artifact.

Acceptance criteria:

- Payload is embedded outside executable JavaScript.
- Chunk IDs are opaque.
- Public manifest is minimized.
- Runtime uses the embedded WASM reader when available.
- Generated HTML does not contain obvious `data:image/` or `data:audio/` media blobs.

## Stage 11: Compression v1

### 11.1 Compression Interface

Define a compression adapter interface.

```ts
interface CompressionCodec {
  name: string;
  compress(bytes: Uint8Array): Promise<Uint8Array>;
  decompress(bytes: Uint8Array): Promise<Uint8Array>;
}
```

Acceptance criteria:

- Core can use codec adapters.
- `none` codec exists.
- Tests use a fake codec.

### 11.2 Add Optional gzip or deflate First

A built-in easy compression mode may be useful before zstd.

Acceptance criteria:

- Works in Node.
- Browser support is either implemented or documented as limited.

### 11.3 Add zstd Adapter

Add optional zstd support if dependency choice is acceptable.

Acceptance criteria:

- Compression can be enabled per payload or per chunk.
- Reader decompresses transparently when codec exists.
- Missing codec produces clear error.

### 11.4 Per-Chunk Compression

Allow each chunk to specify its compression.

Acceptance criteria:

- Already-compressed media can remain uncompressed.
- Text/JSON chunks can be compressed.

### 11.5 Compression Heuristics

Add optional heuristic: skip compression if it does not reduce size.

Acceptance criteria:

- Chunk record stores actual compression used.
- Tests cover incompressible data.

## Stage 12: Format Documentation

### 12.1 Write `docs/format.md`

Document the binary layout in detail.

Acceptance criteria:

- Header documented.
- Footer documented.
- TOC documented.
- Chunk naming documented.
- Versioning documented.

### 12.2 Add Hex Example

Include a tiny sample payload diagram.

Acceptance criteria:

- Docs help a developer debug a corrupted payload.

### 12.3 Document Compatibility Guarantees

State what is stable and what may change before 1.0.

Acceptance criteria:

- Pre-1.0 compatibility rules are clear.
- Users know whether payloads are expected to survive version upgrades.

## Stage 13: Public README

### 13.1 Write README Intro

Acceptance criteria:

- Explains the problem quickly.
- Shows a pack/read example.
- Shows CLI example.
- Mentions single-file HTML.
- States non-DRM limitation.

### 13.2 Add Comparison Section

Compare conceptually with:

- ZIP;
- Emscripten file packages;
- Vite single-file plugins;
- Web Bundles;
- glTF/GLB.

Acceptance criteria:

- Comparisons are fair and non-dismissive.
- The library's niche is clear.

### 13.3 Add Use Cases

Acceptance criteria:

- At least five use cases are listed.
- No private host application is named as a use case.

## Stage 14: Examples v1

### 14.1 Basic Node Example

Packs files and reads them back.

Acceptance criteria:

- Example runs with `npm run example:basic`.

### 14.2 Browser Image Gallery Example

Loads a `.bytedist` file and displays embedded images.

Acceptance criteria:

- Demonstrates object URLs or direct blob handling.
- Uses no framework or uses a minimal framework-neutral setup.

### 14.3 Single-File HTML Example

Produces a single HTML file containing its payload.

Acceptance criteria:

- The output opens from disk.
- It renders content from the embedded payload.

### 14.4 Interactive Document Example

Demonstrates text, JSON, image, and binary resources.

Acceptance criteria:

- Shows the library is not image-specific.

## Stage 15: MVP WASM Reader and Validator

### 15.1 Define Why WASM Exists

Document whether WASM is for:

- speed;
- smaller runtime;
- format validation;
- casual extraction deterrence;
- parity with C/C++ consumers;
- future streaming decode.

Acceptance criteria:

- WASM is not framed as security magic.
- Host-application hardening docs explain that WASM raises casual-analysis friction but does not prevent extraction.

### 15.2 Decide Implementation Language

Options:

- C/C++ with Emscripten;
- Rust with wasm-bindgen;
- Zig to WASM;
- AssemblyScript.

Recommended for this project, given the stated experience: C/C++ with Emscripten first, unless Rust ecosystem benefits outweigh that.

Acceptance criteria:

- Decision is documented.
- Build complexity is understood.

### 15.3 Create MVP WASM Reader

Implement a narrow decoder that reads the header, footer, TOC, chunk metadata, and selected chunk bytes.

Acceptance criteria:

- WASM module can validate a payload.
- WASM module can read at least one named or opaque-ID chunk.
- JS can call into it.
- It returns structured errors or error codes.
- It can run from an embedded single-file HTML artifact.

### 15.4 Avoid Full Rewrite Too Early

Keep TypeScript reader as reference implementation.

Acceptance criteria:

- TS reader remains canonical until WASM is proven useful.
- Test corpus runs against both readers when possible.
- Host-application MVP can use WASM in the browser while tests can compare behavior against the TypeScript reader.

## Stage 16: WASM Runtime API

### 16.1 Define Narrow ABI

Example functions:

```text
payload_open(ptr, len) -> handle
payload_list(handle) -> json ptr/len
payload_read(handle, namePtr, nameLen) -> bytes ptr/len
payload_verify(handle) -> result
payload_close(handle)
```

Acceptance criteria:

- ABI is documented.
- Memory ownership rules are documented.

### 16.2 Add JS Wrapper

Expose a friendly JS API over the raw WASM module.

Acceptance criteria:

- Consumers do not deal with raw pointers.
- Errors become JS exceptions.

### 16.3 Add Embedded WASM Loader

Support WASM bytes embedded in HTML.

Acceptance criteria:

- Single-file HTML can instantiate embedded WASM.
- Fallback to TS reader is possible if WASM fails, if desired.

### 16.4 WASM Test Suite

Run shared fixtures against WASM reader.

Acceptance criteria:

- Valid payload fixtures pass.
- Invalid payload fixtures fail.
- CI builds WASM or at least has a dedicated workflow.

## Stage 17: Optional Binary TOC Evolution

### 17.1 Evaluate JSON TOC Pain

Before replacing JSON TOC, measure:

- payload size impact;
- parse time;
- implementation complexity;
- debugging value.

Acceptance criteria:

- Decision is data-informed.

### 17.2 Choose Binary TOC Format

Candidates:

- custom binary records;
- FlatBuffers;
- Protocol Buffers;
- MessagePack;
- CBOR.

Acceptance criteria:

- Choice supports schema evolution.
- Choice works in browser and Node.
- Choice does not make simple payloads painful.

### 17.3 Add TOC Version Field

Support TOC encoding versions independently from payload file version if needed.

Acceptance criteria:

- Reader can reject unsupported TOC encodings clearly.

### 17.4 Migration Tests

Acceptance criteria:

- Old JSON TOC fixtures still read if compatibility is promised.
- New binary TOC fixtures are covered.

## Stage 18: Streaming and Random Access

### 18.1 External Payload Range Loading

For non-embedded payloads, support HTTP range requests later.

Acceptance criteria:

- Reader can fetch footer/TOC first.
- Reader can fetch only selected chunks.
- Falls back gracefully when range requests are unavailable.

### 18.2 Embedded Payload Limitation Docs

Document that embedded base64 payloads generally require full decode.

Acceptance criteria:

- Users understand size/performance tradeoffs.

### 18.3 Lazy Chunk Decompression

Avoid decompressing all chunks at open time.

Acceptance criteria:

- Chunks decompress on read.
- Cache behavior is configurable or documented.

### 18.4 Cache Strategy

Add optional in-memory cache for decompressed chunks.

Acceptance criteria:

- Large chunks can avoid repeated decompression.
- Cache can be disabled.

## Stage 19: Signing and Provenance

### 19.1 Define Signing Model

Do not invent crypto. Define what is signed:

- TOC;
- chunk hashes;
- payload metadata;
- payload length;
- version.

Acceptance criteria:

- Signing model document exists.
- Threat model is clear.

### 19.2 Add Public-Key Signature Support

Use standard Web Crypto-compatible algorithms where possible.

Acceptance criteria:

- CLI can sign payloads.
- Browser/Node can verify signatures.
- Private keys are never embedded in browser exports by library design.

### 19.3 Add Signature CLI

Commands:

```sh
bytedist sign demo.bytedist --key private.pem --out demo.signed.bytedist
bytedist verify-signature demo.signed.bytedist --key public.pem
```

Acceptance criteria:

- Clear errors for missing/invalid signatures.
- Docs explain trust model.

## Stage 20: Vite Integration

### 20.1 Define Vite Use Cases

Potential plugin capabilities:

- emit `.bytedist` from a directory;
- embed generated payload into HTML;
- embed WASM runtime;
- expose virtual module with payload metadata.

Acceptance criteria:

- Plugin scope is documented before implementation.

### 20.2 Implement Minimal Vite Plugin

Example:

```ts
bytedistPlugin({
  input: "./public-artifact",
  outputName: "artifact.bytedist",
  embed: true
})
```

Acceptance criteria:

- Works in Vite build.
- Does not break dev server.
- Produces deterministic output where possible.

### 20.3 Vite Example

Acceptance criteria:

- Example builds a single-file HTML artifact.
- Example uses framework-neutral or React minimal demo.

## Stage 21: Deterministic Builds

### 21.1 Stable Chunk Ordering

Acceptance criteria:

- Same input produces same chunk order.
- Tests verify deterministic output except for timestamps if enabled.

### 21.2 Optional Timestamp Control

Allow disabling or normalizing timestamps.

Acceptance criteria:

- Reproducible builds are possible.
- Docs explain options.

### 21.3 Stable Hashes

Acceptance criteria:

- Payload hash is stable across runs for identical inputs.

## Stage 22: Metadata and Manifests

### 22.1 App Manifest Convention

Define a conventional manifest chunk name, e.g. `manifest.json`.

Acceptance criteria:

- Library does not require a manifest but supports one ergonomically.

### 22.2 Payload Metadata

Support payload-level metadata:

- title;
- description;
- createdBy;
- createdAt;
- appId;
- appVersion;
- custom fields.

Acceptance criteria:

- Metadata is generic.
- Metadata does not replace app manifest.

### 22.3 Reserved Namespace

Reserve names like:

```text
.bytedist/metadata.json
.bytedist/signature
.bytedist/license.json
```

Acceptance criteria:

- Reserved names documented.
- User chunks cannot accidentally collide unless explicitly allowed.

## Stage 23: Extraction Safety

### 23.1 Path Traversal Defense

Acceptance criteria:

- Extract command never writes outside output directory.
- Tests include malicious names.

### 23.2 Filename Normalization

Acceptance criteria:

- Unicode and platform-specific edge cases are documented.
- Windows unsafe names handled or rejected.

### 23.3 Overwrite Policy

Acceptance criteria:

- CLI documents overwrite behavior.
- `--force` or similar is supported if needed.

## Stage 24: Performance Baseline

### 24.1 Benchmark Packer

Acceptance criteria:

- Benchmarks for many small files.
- Benchmarks for few large files.
- Benchmarks for compressed and uncompressed modes.

### 24.2 Benchmark Reader

Acceptance criteria:

- Open time measured.
- TOC parse time measured.
- Chunk read time measured.
- Verify time measured.

### 24.3 Benchmark Single-File Decode

Acceptance criteria:

- Base64 decode overhead measured.
- Memory overhead noted.
- Docs include practical guidance.

### 24.4 Performance Budget Docs

Acceptance criteria:

- Recommended payload size ranges documented.
- Single-file warnings documented.

## Stage 25: Compatibility Matrix

### 25.1 Browser Matrix

Define support target:

- modern Chromium;
- Firefox;
- Safari;
- mobile browsers if relevant.

Acceptance criteria:

- Browser limitations documented.
- Demos tested manually or via Playwright.

### 25.2 Node Matrix

Define supported Node versions.

Acceptance criteria:

- CI tests supported Node versions.

### 25.3 Bundler Matrix

Document compatibility with:

- Vite;
- webpack;
- Rollup;
- esbuild;
- no bundler.

Acceptance criteria:

- At least Vite and no-bundler examples exist.

## Stage 26: Documentation Site

### 26.1 Choose Docs Tooling

Options:

- plain Markdown in repo;
- VitePress;
- Docusaurus;
- Astro.

Acceptance criteria:

- Docs can be hosted statically.

### 26.2 Write Getting Started

Acceptance criteria:

- User can install, pack, inspect, and read a payload in under ten minutes.

### 26.3 Write Browser Guide

Acceptance criteria:

- Shows fetch loading.
- Shows embedded loading.
- Shows reading images/text/JSON.

### 26.4 Write Single-File Guide

Acceptance criteria:

- Explains base64 overhead.
- Explains local file opening caveats.
- Explains when to prefer multi-file output.

### 26.5 Write Security Model Guide

Acceptance criteria:

- No exaggerated claims.
- Clear explanation of what hardening means.

## Stage 27: Release Preparation

### 27.1 Versioning Policy

Adopt SemVer for library versions.

Acceptance criteria:

- README explains package version vs payload format version.

### 27.2 Changelog

Acceptance criteria:

- `CHANGELOG.md` exists.
- Release notes are generated or manually maintained.

### 27.3 npm Publishing Setup

Acceptance criteria:

- Package files are correct.
- `npm pack` output inspected.
- No test fixtures or huge examples accidentally published unless intended.

### 27.4 First Alpha Release

Suggested version: `0.1.0-alpha.0`.

Acceptance criteria:

- Published package installs cleanly.
- README examples work from published package.

## Stage 28: Host-Application Feedback Loop

### 28.1 Dogfood with a Host Application Privately

Use ByteDist inside a private host application's standalone export pipeline.

Acceptance criteria:

- The host application can generate an application-specific payload using the generic library.
- The host application can embed that payload into a single standalone HTML artifact.
- The artifact opens offline and loads runtime resources through ByteDist.
- Friendly media filenames and obvious media data URLs are absent from the HTML source.
- Any generic improvements are pushed back into ByteDist.
- Host-application-specific code does not leak into core.

### 28.2 Dogfood with Another Demo

Build a second, unrelated example.

Acceptance criteria:

- Proves the library is not overfit to the first private host application.

### 28.3 Gather API Friction

Track awkward APIs.

Acceptance criteria:

- Issues are created for API pain.
- Breaking changes happen before 1.0.

## Stage 29: 0.2 Roadmap Candidates

Potential features after first alpha:

1. zstd compression adapter.
2. WASM reader expansion beyond the MVP surface.
3. Vite plugin alpha.
4. Better single-file HTML helpers.
5. Payload diff tool.
6. Payload signing.
7. Binary TOC.
8. Streaming external payload loading.
9. HTTP range support.
10. Larger examples.
11. Playwright browser tests.
12. Browser memory benchmark.
13. Optional encryption API with extremely careful docs.
14. Integration recipes for React, Svelte, Vue, and vanilla JS.
15. Integration recipe for Three.js asset loading.
16. Integration recipe for offline kiosk apps.
17. Integration recipe for static documentation sites.
18. Web Worker decoding helper.
19. Service worker integration recipe.
20. Payload cache helper.

## Stage 30: 1.0 Readiness Checklist

Do not release 1.0 until:

1. The payload format is stable.
2. The public API is stable.
3. Security model docs are clear.
4. CLI is stable enough for scripts.
5. Browser loading is documented and tested.
6. Single-file HTML embedding is documented and tested.
7. Node and browser builds are cleanly separated.
8. At least three examples exist.
9. At least one host application has dogfooded it.
10. Performance characteristics are documented.
11. Corruption and invalid payload behavior is tested.
12. Backward compatibility policy is explicit.
13. Release automation works.
14. Published npm package has correct files.
15. README does not overpromise.
16. License is settled.
17. Dependency footprint is acceptable.
18. Format docs are good enough for a third party to write a reader.
19. Tests cover malicious chunk names.
20. Tests cover large-ish payloads.

## Potential Host Application Integration Layer

This should live outside ByteDist core.

```text
host application export model
  -> sanitize public viewer model
  -> generate derivative media
  -> create application manifest
  -> create ByteDist payload
  -> optionally embed into single HTML
```

Application-specific extension:

```text
.examplepkg
  uses ByteDist-compatible container
  contains application-specific manifest and resources
```

Possible internal chunk names:

```text
manifest.json
floorplan/floorplan.svg
geometry/walls.bin
geometry/collision.bin
artworks/artwork-001.webp
audio/audio-001.mp3
labels/labels.json
atmosphere/atmosphere.json
```

ByteDist should not care what these mean.

## Risk Register

### Risk: The Library Becomes Too Generic

Mitigation:

- Keep v1 focused on pack/read/verify/embed.
- Do not build every archive feature.

### Risk: Users Think It Is DRM

Mitigation:

- Strong security-model docs.
- Avoid protection/security marketing.
- Use terms like packaging, integrity, hardening, and portability.

### Risk: Base64 Single-File Exports Are Too Large

Mitigation:

- Support both embedded and external payload modes.
- Document tradeoffs.
- Add compression.

### Risk: WASM Adds Complexity Too Early

Mitigation:

- Ship TypeScript reader first as the reference implementation.
- Keep the MVP WASM reader narrow: open, validate, list, read, and verify.
- Keep shared fixtures.
- Defer advanced WASM features until after host-application dogfooding.

### Risk: Format Churn Hurts Early Users

Mitigation:

- Stay pre-1.0 until format is stable.
- Document compatibility clearly.
- Include format version checks.

### Risk: Node/Browser Split Gets Messy

Mitigation:

- Avoid accidental Node imports in browser code.
- Use package exports carefully.
- Add browser tests.

### Risk: Compression Dependencies Become Heavy

Mitigation:

- Keep compression adapters optional.
- Default to no compression or lightweight compression first.

### Risk: The CLI Is More Useful Than the Library

Mitigation:

- That is acceptable, but ensure programmatic APIs remain first-class.

### Risk: It Competes with ZIP Confusingly

Mitigation:

- Explain the niche: browser-runtime-friendly, app-manifest-aware, single-file HTML embedding, WASM-friendly validation.

## Suggested First Codex Prompts

### Prompt 1: Repository Skeleton

```text
Create a TypeScript npm package skeleton for ByteDist. Add package.json, tsconfig.json, Vitest, Prettier, README.md, LICENSE placeholder, and src/index.ts. Add scripts for build, test, format, and typecheck. Keep it ESM-first and emit declaration files.
```

### Prompt 2: Format Constants and Errors

```text
Add src/format/constants.ts, src/format/types.ts, and src/format/errors.ts. Define magic bytes, format version, public types for chunk records and TOC, and specific error classes for format/version/integrity/chunk-not-found/compression/embedding errors. Export them from src/index.ts. Add unit tests.
```

### Prompt 3: Minimal Packer

```text
Implement createPayload in src/core/pack.ts. It should accept a manifest object and a list of named Uint8Array file records, write a binary payload with header, chunk data, JSON TOC, and footer, and return Uint8Array. Use no compression initially. Reject duplicate or unsafe names. Add unit tests.
```

### Prompt 4: Minimal Reader

```text
Implement openPayload in src/core/read.ts. It should validate the header/footer, parse the JSON TOC, expose list(), has(), readBytes(), readText(), readJson(), getToc(), and close/no-op. Add tests using payloads generated by createPayload.
```

### Prompt 5: Integrity

```text
Add SHA-256 chunk hashing during pack and archive.verify() during read. Use a cross-runtime approach that works in Node tests and browser-compatible code where possible. Add corruption tests.
```

### Prompt 6: CLI

```text
Add a CLI entrypoint with pack, inspect, verify, and bundle-html commands. Keep dependencies minimal. The pack command should recursively pack a directory. Defer the public extract command until after the first MVP, but keep internal fixture-inspection helpers for tests if needed. Add integration tests.
```

### Prompt 7: Single-File HTML

```text
Add html embedding helpers that inject a base64 payload into an HTML template and browser helpers that read the embedded payload back into Uint8Array. Add a minimal example HTML file that displays JSON and image assets from an embedded payload, without exposing raw image/audio data URLs in executable JavaScript.
```

### Prompt 8: Browser Demo

```text
Create a Vite-powered browser demo that loads either an external .bytedist file or an embedded payload and displays its manifest and image assets. Keep the demo framework-free.
```

### Prompt 9: Security Docs

```text
Write SECURITY.md and docs/security-model.md explaining that ByteDist is not DRM, does not prevent determined extraction, must not contain secrets, and is intended for packaging, integrity, portability, and casual-extraction deterrence.
```

### Prompt 10: MVP WASM Reader

```text
Add a narrow WASM reader/validator for the hardened standalone HTML runtime. It should open a payload, validate header/footer/TOC, verify integrity metadata where present, read selected chunks, and expose a small JS wrapper. Keep the TypeScript reader as the reference implementation and run shared fixtures against both paths.
```

### Prompt 11: Alpha Release Polish

```text
Review README, CLI help output, package exports, npm files, examples, and tests for a 0.1.0-alpha.0 release. Ensure no private-host-application concepts appear in the core docs or examples.
```

## Minimal v0 Acceptance Criteria

The project has reached useful v0 when all of the following are true:

1. A Node script can pack a directory into a `.bytedist` file.
2. A Node script can inspect and verify that `.bytedist` file.
3. A browser page can load a `.bytedist` file and read JSON/text/binary chunks.
4. A single HTML file can embed a `.bytedist` and read it at runtime.
5. Payloads have versioned headers and footers.
6. Payloads have a TOC.
7. Chunk names are safe.
8. SHA-256 verification works.
9. Hardened payloads can use opaque chunk IDs.
10. The embedded browser runtime can use the WASM reader/validator path.
11. README explains the use case clearly.
12. Docs state that the project is not DRM.
13. At least two examples exist.
14. The package can be published to npm.

## Minimal v1 Acceptance Criteria

The project is ready for v1 when all of the following are true:

1. Format is stable.
2. TypeScript API is stable.
3. CLI is stable.
4. Browser and Node usage are both documented.
5. Single-file HTML embedding is stable.
6. Optional compression is stable.
7. WASM reader/validator is stable enough for the hardened standalone HTML profile.
8. Test coverage includes invalid/corrupt/malicious payloads.
9. Documentation includes security model, format, CLI, API, and examples.
10. At least one host application uses it successfully.

## Final Strategic Recommendation

Build ByteDist as a generic, boring, well-documented binary payload toolkit first.

Do not start with WebGPU, Three.js, host-application semantics, encryption, or DRM-like language.

The ideal first public release should feel like this:

```text
npm install bytedist
bytedist pack ./artifact --out artifact.bytedist
bytedist bundle-html --template index.html --payload artifact.bytedist --out artifact.html
```

And the runtime should feel like this:

```ts
import { openPayload } from "bytedist/browser";

const archive = await openPayload(bytes);
const manifest = await archive.readJson("manifest.json");
const image = await archive.readBytes("assets/image.webp");
```

If that works cleanly with the WASM reader path in a standalone artifact, the first MVP is valuable to host applications that need packaging, portability, and practical casual-extraction deterrence.

After that, ByteDist can expand into faster decoding, better compression, signing, streaming, and public extraction tooling without weakening the first hardening story.
