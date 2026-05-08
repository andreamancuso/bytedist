# ByteDist

ByteDist is a generic, open-source, WASM-friendly binary payload toolkit for
offline-capable web artifacts.

The project is intended to provide:

- a versioned binary payload format;
- TypeScript packer and reference reader APIs;
- browser/runtime readers;
- single-file HTML payload embedding helpers;
- integrity verification;
- narrow WASM reader/validator support for hardened standalone artifacts;
- CLI tooling for packing, inspecting, verifying, and bundling HTML artifacts.

This repository is at the package-skeleton stage. The payload format and runtime
APIs are intentionally not implemented yet.

## Who Is This For?

ByteDist is for authors of browser-based tools, local-first applications,
interactive documents, static export generators, offline demos, kiosks, and web
games that need a clean packaging boundary for application manifests and binary
resources.

Host applications should be able to create application-specific manifests and
resource chunks without ByteDist depending on any one framework, renderer,
bundler, or content model.

## What ByteDist Is Not

ByteDist is not DRM, encryption, anti-piracy technology, a tamper-proof package,
a trusted execution environment, a general ZIP/TAR replacement, or a package
manager.

Client-delivered artifacts contain the bytes and runtime needed to use them, so
determined users can extract assets. ByteDist can make casual extraction less
convenient and can provide integrity checks and a cleaner packaging boundary, but
it must not be used to hide secrets.

## Status

Current milestone: repository and npm package skeleton.

Available today:

- ESM-first package metadata;
- TypeScript build with declaration output;
- Vitest test runner;
- Prettier formatting scripts;
- public security guidance.

Planned next slices are described in `ROADMAP.md`.

## Scripts

```sh
npm run build
npm test
npm run typecheck
npm run format
npm run format:check
```

## License

MIT.
