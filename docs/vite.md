# ByteDist Vite Plugin

ByteDist exposes an optional Vite build plugin from `bytedist/vite`.

The plugin is build-only. It does not change Vite's dev server behavior, and it
does not make the core ByteDist package depend on Vite at runtime.

## Install

Vite is an optional peer dependency for ByteDist:

```sh
npm install bytedist@alpha vite
```

The optional peer range is
`^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0-0`. The core package does not import Vite
at runtime; only consumers that import `bytedist/vite` need Vite installed.

For TypeScript projects that import the virtual metadata module, add this type
reference somewhere included by your `tsconfig.json`:

```ts
/// <reference types="bytedist/vite/client" />
```

## Basic Usage

```ts
import { defineConfig } from "vite";
import { bytedistPlugin } from "bytedist/vite";

export default defineConfig({
  plugins: [
    bytedistPlugin({
      input: "./artifact",
      manifestPath: "manifest.json",
      outputName: "artifact.bytedist",
      embed: true
    })
  ]
});
```

When `embed` is enabled, the plugin replaces `<!-- BYTEDIST_PAYLOAD -->` in the
HTML with a non-executable embedded payload block. When `emit` is enabled, the
plugin emits a `.bytedist` asset into the Vite output directory.

Default behavior:

- `outputName` defaults to `artifact.bytedist`;
- `emit` defaults to `true` when `embed` is not enabled;
- `emit` defaults to `false` when `embed` is enabled;
- integrity defaults to `sha256`;
- `createdBy` defaults to `bytedist/vite`.
- payload chunk ordering follows `packDirectory`, which sorts collected chunk
  names deterministically.

## Options

The plugin accepts the same directory-packing options as `packDirectory`:

- `manifestPath`;
- `ignore`;
- `integrity`;
- `compression`;
- `compressionMode`;
- `compressionCodecs`;
- `metadata`;
- `allowReservedChunkNames`.

The plugin follows `packDirectory` defaults, including rejection of the reserved
`.bytedist` chunk namespace unless `allowReservedChunkNames: true` is supplied.

It also accepts Vite-specific options:

- `input`: directory to pack, resolved relative to the Vite project root unless
  absolute;
- `outputName`: emitted payload asset name;
- `emit`: whether to emit the payload as a build asset;
- `embed`: whether to embed the payload into HTML, or embed options such as a
  custom marker;
- `wasm`: optional WASM file path or options to embed at `<!-- BYTEDIST_WASM -->`.

## Virtual Metadata

Application code can import build metadata:

```ts
import metadata, { chunks, payloadSize } from "virtual:bytedist/payload";

console.log(metadata.outputName, payloadSize, chunks.length);
```

The metadata includes payload size, output name, emitted/embedded flags, manifest
path, chunk count, and public chunk metadata. It does not include chunk bytes.

For repeatable payload bytes, keep input files, manifest content, metadata,
compression options, and plugin options stable. See
[`deterministic-builds.md`](deterministic-builds.md) for details.

## Single-File Output

Embedding is useful for standalone HTML artifacts that need to open directly from
disk. Embedded payloads are base64 data blocks, so they usually require full
decode before opening. For larger hosted artifacts, prefer emitted external
payloads and browser loading helpers such as `openPayloadFromUrlRange`.

## Security Notes

The Vite plugin is packaging tooling. It is not DRM, encryption, access control,
or a place to store secrets. Any browser-delivered artifact contains the bytes
and runtime needed to read those bytes.
