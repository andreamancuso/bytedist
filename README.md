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

This repository is at the early format-surface stage. It exports initial format
constants, public TypeScript types, validation helpers, and error classes. The
payload writer, reader, CLI, browser runtime, and WASM reader are intentionally
not implemented yet.

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

Current milestone: integrity support.

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
