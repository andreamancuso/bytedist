# ByteDist

ByteDist is a generic, open-source binary payload toolkit for offline-capable web
artifacts.

It helps applications package a manifest plus binary resources into one
runtime-readable `.bytedist` payload that can be inspected, verified, loaded in
Node.js or browsers, and embedded into a self-contained HTML export.

ByteDist is useful when loose files, large inline JSON, or visible base64 media
blobs make an export harder to ship, inspect, or maintain.

## What It Does

- Writes versioned `.bytedist` payloads with a footer-located JSON TOC.
- Reads payloads through TypeScript APIs in Node.js and browsers.
- Verifies per-chunk SHA-256 metadata and TOC CRC32 corruption checks.
- Packs directories and writes payload files through `bytedist/node`.
- Provides CLI commands for `pack`, `inspect`, `verify`, and `bundle-html`.
- Embeds payload bytes into non-executable single-file HTML data blocks.
- Creates browser `Blob` and object URL resources from payload chunks.
- Supports opt-in compression codec adapters.

The current payload format is version `0` and is still pre-1.0. See
[`docs/format.md`](docs/format.md) for the binary layout and compatibility
notes.

## Quick Start

Install dependencies and run the local CLI from this package:

```sh
npm install
npm run build
npx bytedist pack ./artifact --manifest manifest.json --out artifact.bytedist
npx bytedist inspect artifact.bytedist
npx bytedist verify artifact.bytedist
```

Bundle an existing payload into one HTML file:

```sh
npx bytedist bundle-html \
  --template index.html \
  --payload artifact.bytedist \
  --out artifact.html
```

`bundle-html` replaces `<!-- BYTEDIST_PAYLOAD -->` with a non-executable
`application/octet-stream+base64` payload block. Optional runtime JavaScript and
WASM data blocks use `<!-- BYTEDIST_RUNTIME -->` and `<!-- BYTEDIST_WASM -->`.

The CLI intentionally does not expose a public `extract` command in the MVP.

## TypeScript API

Create and read an in-memory payload:

```ts
import { createPayload, openPayload } from "bytedist";

const text = new TextEncoder().encode("hello");

const payload = await createPayload({
  manifest: { entry: "c/hello" },
  files: [
    {
      name: "c/hello",
      bytes: text,
      mime: "text/plain",
      encoding: "utf-8"
    }
  ],
  integrity: "sha256"
});

const archive = await openPayload(payload);

await archive.verify();
console.log(await archive.readText("c/hello"));
```

Pack a directory in Node.js:

```ts
import { packDirectory, writePayloadFile } from "bytedist/node";

const payload = await packDirectory("./artifact", {
  manifestPath: "manifest.json",
  integrity: "sha256"
});

await writePayloadFile("./artifact.bytedist", payload, { overwrite: true });
```

Load a payload in the browser and display a resource:

```ts
import { createChunkObjectUrl, loadPayloadFromUrl } from "bytedist/browser";

const archive = await loadPayloadFromUrl("artifact.bytedist");
await archive.verify();

const image = await createChunkObjectUrl(archive, "c/a91d4e70");
document.querySelector("img")?.setAttribute("src", image.url);

// Revoke when the resource is no longer displayed.
image.revoke();
```

Embed a payload into HTML:

```ts
import { openEmbeddedPayload } from "bytedist/browser";
import { embedPayloadInHtml } from "bytedist/html";

const html = embedPayloadInHtml(templateHtml, payloadBytes);
const archive = await openEmbeddedPayload();
```

A minimal no-bundler single-file example lives in
[`examples/single-file-html/`](examples/single-file-html/).

## Compression

Compression is adapter-based and opt-in. The built-in codec is `none`; gzip,
deflate, and zstd adapters are planned later.

```ts
import { createPayload, openPayload, type CompressionCodec } from "bytedist";

const codec: CompressionCodec = {
  name: "custom",
  compress: async (bytes) => bytes,
  decompress: async (bytes) => bytes
};

const payload = await createPayload({
  files,
  compression: "custom",
  compressionCodecs: [codec]
});

const archive = await openPayload(payload, {
  compressionCodecs: [codec]
});
```

## Use Cases

- Local-first app exports that need application state and binary resources in one
  portable artifact.
- Browser-based editor standalone exports with a clean package boundary.
- Interactive documents with JSON, text, images, audio, or other binary chunks.
- Kiosk, demo, and training artifacts that must open without a server.
- Web games and visualizations that want runtime-readable asset packages.
- Offline inspection and verification workflows for generated web artifacts.

## How It Compares

ByteDist is not trying to replace every packaging format. Its niche is
browser-runtime-friendly payloads for application-owned manifests and resources.

| Tool or format           | How it differs                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ZIP/TAR                  | General archive formats. ByteDist is narrower: it has a runtime TOC, web-oriented reader APIs, payload verification, and single-file HTML embedding helpers. |
| Emscripten file packages | Usually tied to an Emscripten runtime/filesystem model. ByteDist is a standalone payload format and does not require MEMFS.                                  |
| Vite single-file plugins | Usually inline bundler output. ByteDist keeps application resources behind an explicit binary payload boundary that can be inspected and verified.           |
| Web Bundles              | A browser/platform packaging proposal. ByteDist is application-owned data loaded by an explicit runtime reader.                                              |
| glTF/GLB                 | A specialized 3D asset container. ByteDist is generic and leaves application schemas to host applications.                                                   |

## What ByteDist Is Not

ByteDist is not DRM, encryption, anti-piracy technology, a tamper-proof package,
a trusted execution environment, a general ZIP/TAR replacement, or a package
manager.

Client-delivered artifacts contain the bytes and runtime needed to use them, so
determined users can extract assets. ByteDist can make casual extraction less
convenient and can provide integrity checks and a cleaner packaging boundary, but
it must not be used to hide secrets, credentials, private keys, or license
secrets.

## Status

Available today:

- TypeScript writer and reference reader.
- Directory packing helpers for Node.js.
- Browser payload loading and object URL helpers.
- Single-file HTML payload embedding helpers.
- CLI commands for `pack`, `inspect`, `verify`, and `bundle-html`.
- Adapter-based compression plumbing.
- Format documentation in [`docs/format.md`](docs/format.md).

Planned next:

- runnable examples;
- WASM reader/validator for hardened standalone artifacts;
- built-in compression adapters;
- broader browser compatibility notes.

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
