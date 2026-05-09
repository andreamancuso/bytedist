# Getting Started

This guide shows the shortest path from loose files to a readable `.bytedist`
payload.

## Install

In an application that consumes ByteDist:

```sh
npm install bytedist
```

When working from this repository:

```sh
npm install
npm run build
```

## Prepare Input Files

A ByteDist payload usually contains an application-defined manifest and any
binary or text resources that manifest references. For a minimal payload, create
an input directory like this:

```text
artifact/
  manifest.json
  content/
    hello.txt
```

Example `manifest.json`:

```json
{
  "title": "Hello Payload",
  "entry": "content/hello.txt"
}
```

## Pack

Pack the directory into a `.bytedist` file:

```sh
npx bytedist pack ./artifact --manifest manifest.json --out artifact.bytedist
```

The `pack` command writes SHA-256 chunk integrity metadata by default and
requires `--force` before overwriting an existing output file.

## Inspect

Inspect the payload structure:

```sh
npx bytedist inspect artifact.bytedist
```

The output reports the format version, payload length, TOC location, manifest
chunk, and chunk metadata.

## Verify

Verify payload integrity:

```sh
npx bytedist verify artifact.bytedist
```

Verification checks TOC corruption metadata and per-chunk SHA-256 metadata when
present. It is useful for detecting accidental corruption or unexpected changes;
it does not make a client-delivered artifact tamper-proof.

## Read From Node.js

Read the payload from an application script:

```ts
import { readFile } from "node:fs/promises";
import { openPayload } from "bytedist";

const payloadBytes = await readFile("artifact.bytedist");
const archive = await openPayload(payloadBytes);

await archive.verify();

const manifest = await archive.readJson<{ title: string; entry: string }>("manifest.json");
const text = await archive.readText(manifest.entry);

console.log(manifest.title);
console.log(text);
```

Use `readBytes` for binary resources:

```ts
const imageBytes = await archive.readBytes("assets/image.webp");
```

## Next Steps

- Use [`browser.md`](browser.md) for browser loading and object URL helpers.
- Use [`single-file-html.md`](single-file-html.md) for standalone HTML exports.
- Use [`metadata-and-manifests.md`](metadata-and-manifests.md) for manifest and
  reserved namespace conventions.
- Read [`security-model.md`](security-model.md) before using ByteDist as part of
  a hardened export workflow.
