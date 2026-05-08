# ByteDist

ByteDist is a generic, open-source, WASM-friendly binary payload toolkit for
offline-capable web artifacts.

ByteDist is designed for web artifacts that need a cleaner packaging boundary
than loose files, large inline JSON, or visible base64 media blobs. A host
application will be able to pack an application manifest and binary resources
into a runtime-readable payload that can be loaded from Node.js, modern
browsers, or a self-contained HTML export.

The project is intended to provide:

- a versioned binary payload format;
- TypeScript packer and reference reader APIs;
- browser/runtime readers;
- single-file HTML payload embedding helpers;
- integrity verification;
- narrow WASM reader/validator support for hardened standalone artifacts;
- CLI tooling for packing, inspecting, verifying, and bundling HTML artifacts.

This repository is at the early MVP stage. It exports the initial payload
format, in-memory writer and reader APIs, Node filesystem helpers, CLI commands,
browser loading helpers, single-file HTML embedding helpers, and an HTML bundler
CLI. The WASM reader is planned next.

## Project Brief

ByteDist aims to make offline-capable web exports easier to package, inspect,
verify, and embed without tying the payload format to any one application,
framework, renderer, or bundler.

Expected use cases include:

- static exports for browser-based editors and local-first applications;
- interactive documents that need text, JSON, images, audio, or binary resources;
- kiosk, demo, game, visualization, and training artifacts that need to open
  without a server.

ByteDist treats application-specific data as caller-owned. The library should
provide the packaging boundary, integrity hooks, runtime reader APIs, and
single-file HTML helpers; the host application remains responsible for its own
manifest schema, sanitization, rendering, and policy decisions.

## Who Is This For?

ByteDist is for authors of browser-based tools, local-first applications,
interactive documents, static export generators, offline demos, kiosks, and web
games that need a clean packaging boundary for application manifests and binary
resources.

Host applications should be able to create application-specific manifests and resource chunks
without ByteDist depending on any one framework, renderer, bundler, or content model.

## What ByteDist Is Not

ByteDist is not DRM, encryption, anti-piracy technology, a tamper-proof package,
a trusted execution environment, a general ZIP/TAR replacement, or a package
manager.

Client-delivered artifacts contain the bytes and runtime needed to use them, so
determined users can extract assets. ByteDist can make casual extraction less
convenient and can provide integrity checks and a cleaner packaging boundary, but
it must not be used to hide secrets.

## Status

Current milestone: HTML bundler CLI.

Available today:

- ESM-first package metadata;
- TypeScript build with declaration output;
- Vitest test runner;
- Prettier formatting scripts;
- public security guidance.
- fixed payload magic bytes: `BDISTPAY`;
- distinct footer magic bytes: `BDISTEND`;
- payload format version constant: `0`;
- low-level format validation helpers;
- public error classes and planned API types.
- `createPayload` for in-memory v0 payload creation;
- JSON TOC and footer metadata writing;
- optional per-chunk SHA-256 hash metadata.
- `openPayload` for in-memory v0 payload reading;
- archive helpers for `list`, `has`, `getToc`, `readBytes`, `readText`, and `readJson`.
- `archive.verify()` for SHA-256 chunk integrity verification;
- footer CRC32 for TOC corruption detection.
- `bytedist/node` helpers for packing directories and writing payload files.
- `bytedist` CLI commands for `pack`, `inspect`, `verify`, and `bundle-html`.
- `bytedist/browser` helpers for URL, Blob, File, and object URL loading.
- `bytedist/html` helpers for base64 payload blocks and HTML template injection.

CLI:

```sh
bytedist pack ./artifact --manifest manifest.json --out artifact.bytedist
bytedist inspect artifact.bytedist
bytedist verify artifact.bytedist
bytedist bundle-html --template index.html --payload artifact.bytedist --out artifact.html
```

The first CLI intentionally does not expose an `extract` command. Public
extraction tooling is post-MVP.

Node-only helpers are exported from `bytedist/node`:

```ts
import { packDirectory, writePayloadFile } from "bytedist/node";

const payload = await packDirectory("./artifact", {
  manifestPath: "manifest.json",
  integrity: "sha256"
});

await writePayloadFile("./artifact.bytedist", payload, { overwrite: true });
```

Directory packing uses deliberately small ignore semantics: exact relative paths,
directory prefixes ending in `/`, `*` within one path segment, and `**` across
segments.

Browser helpers are exported from `bytedist/browser`:

```ts
import { createChunkObjectUrl, loadPayloadFromUrl } from "bytedist/browser";

const archive = await loadPayloadFromUrl("artifact.bytedist");
await archive.verify();

const image = await createChunkObjectUrl(archive, "c/a91d4e70");
document.querySelector("img")?.setAttribute("src", image.url);

// Revoke when the resource is no longer displayed.
image.revoke();
```

Single-file HTML helpers are exported from `bytedist/html`, with embedded
runtime loading available from `bytedist/browser`:

```ts
import { loadPayloadFromUrl, openEmbeddedPayload } from "bytedist/browser";
import { embedPayloadInHtml } from "bytedist/html";

const html = embedPayloadInHtml(templateHtml, payloadBytes);
const archive = await openEmbeddedPayload();

// External payload loading still works for hosted artifacts.
const hostedArchive = await loadPayloadFromUrl("artifact.bytedist");
```

A minimal no-bundler example lives in `examples/single-file-html/`.

`bundle-html` embeds payload bytes at `<!-- BYTEDIST_PAYLOAD -->`. Optional
runtime and WASM inputs use `<!-- BYTEDIST_RUNTIME -->` and
`<!-- BYTEDIST_WASM -->`. The payload and WASM blocks are non-executable base64
data blocks; caller-provided runtime JavaScript is executable by design. The
command embeds an existing `.bytedist` file; use `pack` first when starting from
a directory.

Planned next slices are described in `ROADMAP.md`.

## Scripts

```sh
npm run build
npm test
npm run typecheck
npm run format
npm run format:check
npm pack --dry-run
```

## License

MIT.
