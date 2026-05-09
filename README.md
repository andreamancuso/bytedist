# ByteDist

ByteDist is a TypeScript toolkit for packaging application manifests and binary
resources into portable web artifacts.

It helps applications package a manifest plus binary resources into one
runtime-readable `.bytedist` asset package that can be inspected, verified,
loaded in Node.js or browsers, and embedded into a self-contained HTML export.

ByteDist is useful when loose files, large inline JSON, or visible base64 media
blobs make an export harder to ship, inspect, or maintain.

## What It Does

- Writes versioned `.bytedist` payloads with a footer-located JSON TOC.
- Reads payloads through TypeScript APIs in Node.js and browsers.
- Supports HTTP range loading for hosted external payloads.
- Verifies per-chunk SHA-256 metadata and TOC CRC32 corruption checks.
- Supports deterministic chunk ordering and whole-payload SHA-256 hashes.
- Defines conventional manifest, payload metadata, and reserved namespace
  helpers.
- Signs and verifies detached provenance envelopes with public-key signatures.
- Packs directories and writes payload files through `bytedist/node`.
- Integrates with Vite builds through the optional `bytedist/vite` plugin.
- Provides CLI commands for `pack`, `inspect`, `verify`, `sign`,
  `verify-signature`, and `bundle-html`.
- Embeds payload bytes into non-executable single-file HTML data blocks.
- Creates browser `Blob` and object URL resources from payload chunks.
- Supports opt-in compression codec adapters.

The current payload format is version `0` and is still pre-1.0. See
[`docs/format.md`](docs/format.md) for the binary layout and compatibility
notes. The documentation index starts at [`docs/index.md`](docs/index.md).

## Versioning

ByteDist package releases follow SemVer. While the package is `0.x`, public APIs
and payload format details may still change between minor versions.

During the alpha period, install the published package with:

```sh
npm install bytedist@alpha
```

The npm package version is separate from the `.bytedist` payload format version.
The current payload format is version `0`; unsupported payload format versions
are rejected rather than guessed. Keep source assets available so early payloads
can be repacked if the pre-1.0 format changes.

## Quick Start

Install dependencies and run the local CLI from this package:

```sh
npm install
npm run build
npx bytedist pack ./artifact --manifest manifest.json --out artifact.bytedist
npx bytedist inspect artifact.bytedist
npx bytedist verify artifact.bytedist
```

Sign and verify a detached provenance envelope:

```sh
npx bytedist sign artifact.bytedist --key private.pem --out artifact.bytedist.sig.json
npx bytedist verify-signature artifact.bytedist --key public.pem --signature artifact.bytedist.sig.json
```

Bundle an existing `.bytedist` file into one HTML file:

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
import { computePayloadHash, createPayload, openPayload } from "bytedist";

const text = new TextEncoder().encode("hello");

const payload = await createPayload({
  manifest: { entry: "c/hello" },
  chunkOrder: "name",
  files: [
    {
      name: "c/hello",
      bytes: text,
      mime: "text/plain",
      encoding: "utf-8"
    }
  ],
  integrity: "sha256",
  metadata: {
    title: "Example Payload",
    appId: "example.app",
    appVersion: "1.0.0"
  }
});

const payloadHash = await computePayloadHash(payload);
const archive = await openPayload(payload);

await archive.verify();
console.log(payloadHash.value);
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

Load a hosted payload through HTTP ranges:

```ts
import { openPayloadFromUrlRange } from "bytedist/browser";

const archive = await openPayloadFromUrlRange("artifact.bytedist", {
  cache: "none"
});
```

Embed a payload into HTML:

```ts
import { openEmbeddedPayload } from "bytedist/browser";
import { embedPayloadInHtml } from "bytedist/html";

const html = embedPayloadInHtml(templateHtml, payloadBytes);
const archive = await openEmbeddedPayload();
```

Pack and embed a payload during a Vite build:

```ts
import { defineConfig } from "vite";
import { bytedistPlugin } from "bytedist/vite";

export default defineConfig({
  plugins: [
    bytedistPlugin({
      input: "./artifact",
      manifestPath: "manifest.json",
      embed: true
    })
  ]
});
```

Sign and verify a detached provenance envelope:

```ts
import { signPayload, verifyPayloadSignature } from "bytedist";

const envelope = await signPayload(payloadBytes, privateKeyPem);
await verifyPayloadSignature(payloadBytes, envelope, publicKeyPem);
```

A minimal no-bundler single-file example lives in
[`examples/single-file-html/`](examples/single-file-html/).

## Metadata And Manifests

The conventional application manifest chunk name is `manifest.json`. Payload
metadata is separate, generic TOC-level JSON for inspection and tooling fields
such as `title`, `description`, `createdBy`, `createdAt`, `appId`, and
`appVersion`.

The `.bytedist` chunk namespace is reserved for ByteDist-owned conventional
chunks and is rejected by default unless `allowReservedChunkNames: true` is set.
See [`docs/metadata-and-manifests.md`](docs/metadata-and-manifests.md).

## Examples

Runnable examples are repo-only and generate output under `examples/.generated/`:

```sh
npm run example:basic
npm run example:browser-gallery
npm run example:single-file-html
npm run example:interactive-document
npm run example:open-museum-pack
npm run example:vite
npm run example:all
```

The examples cover Node pack/read/verify, a browser file-input gallery, generated
single-file HTML, a mixed-resource interactive document payload, an open museum
fixture built from Art Institute of Chicago public-domain artwork records, and a
framework-neutral Vite build.

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
browser-runtime-friendly asset packages for application-owned manifests and
resources.

| Tool or format           | How it differs                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ZIP/TAR                  | General archive formats. ByteDist is narrower: it has a runtime TOC, web-oriented reader APIs, payload verification, and single-file HTML embedding helpers. |
| Emscripten file packages | Usually tied to an Emscripten runtime/filesystem model. ByteDist is a standalone payload format and does not require MEMFS.                                  |
| Vite single-file plugins | Usually inline bundler output. ByteDist can integrate with Vite while keeping application resources behind an explicit binary payload boundary.              |
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
- HTTP range loading for external browser payloads.
- CLI commands for `pack`, `inspect`, `verify`, and `bundle-html`.
- Detached payload signing and signature verification.
- Optional Vite build plugin in `bytedist/vite`.
- Adapter-based compression plumbing.
- Changelog in [`CHANGELOG.md`](CHANGELOG.md).
- Documentation index in [`docs/index.md`](docs/index.md).
- Getting started guide in [`docs/getting-started.md`](docs/getting-started.md).
- Security model guide in [`docs/security-model.md`](docs/security-model.md).
- Format documentation in [`docs/format.md`](docs/format.md).
- Metadata and manifest notes in
  [`docs/metadata-and-manifests.md`](docs/metadata-and-manifests.md).
- Extraction safety notes in [`docs/extraction-safety.md`](docs/extraction-safety.md).
- Performance baseline notes in [`docs/performance.md`](docs/performance.md).
- Compatibility matrix in [`docs/compatibility.md`](docs/compatibility.md).
- Deterministic build notes in
  [`docs/deterministic-builds.md`](docs/deterministic-builds.md).
- Browser loading notes in [`docs/browser.md`](docs/browser.md).
- Single-file HTML notes in [`docs/single-file-html.md`](docs/single-file-html.md).
- Signing and provenance notes in [`docs/signing.md`](docs/signing.md).
- Vite integration notes in [`docs/vite.md`](docs/vite.md).
- Experimental WASM reader/validator wrapper in `bytedist/wasm`.
- WASM runtime notes in [`docs/wasm.md`](docs/wasm.md).

Planned next:

- built-in compression adapters;
- automated browser compatibility tests;
- host application feedback loop.

## Scripts

```sh
npm run build
npm test
npm run typecheck
npm run format
npm run format:check
npm run toc:measure
npm run perf:baseline:quick
npm run perf:baseline
npm run wasm:build
npm run wasm:test
npm run example:vite
npm pack --dry-run
```

## License

MIT.
