# Deterministic Builds

ByteDist can produce repeatable payload bytes when inputs and options are stable.
This is useful for build caching, comparing artifacts, provenance workflows, and
release checks.

Deterministic packaging is not authenticity, access control, or DRM. Use
detached signatures when a workflow needs provenance under a public-key trust
model.

## What ByteDist Controls

ByteDist version `0` does not emit implicit timestamps. The writer only stores
the bytes, chunk records, manifest reference, caller-provided metadata, TOC, and
footer fields needed for the payload.

For in-memory payloads, `createPayload` supports:

```ts
await createPayload({
  files,
  chunkOrder: "name"
});
```

`chunkOrder` values:

- `"input"`: preserve the caller-provided file order; this is the default;
- `"name"`: sort caller-provided file chunks by chunk name.

When `manifest` is supplied to `createPayload`, the generated `manifest.json`
chunk remains first. Caller-provided file chunks are sorted after it when
`chunkOrder: "name"` is used.

For directory payloads, `packDirectory` sorts collected chunk names
deterministically. Filesystem enumeration order and file modification times do
not affect the generated payload.

## What Callers Control

ByteDist treats caller-provided manifests and metadata as ordinary payload data.
If a manifest or metadata object contains a timestamp, random ID, machine path,
or build-specific value, that value will affect the output bytes.

For reproducible builds:

- omit timestamps unless they are required;
- normalize any required timestamp or build ID before packing;
- keep file bytes stable;
- keep compression options stable;
- use deterministic compression codecs.

Compression adapters are caller-supplied in v0. ByteDist cannot guarantee
deterministic output for a codec that embeds timestamps, random seeds, host
metadata, or nondeterministic compression settings.

## Payload Hashes

Use `computePayloadHash` to produce a SHA-256 hash over the complete payload
bytes:

```ts
import { computePayloadHash, createPayload } from "bytedist";

const payload = await createPayload({
  files,
  chunkOrder: "name",
  integrity: "sha256"
});

const hash = await computePayloadHash(payload);
console.log(hash.algorithm, hash.value);
```

The whole-payload hash is useful for comparing byte-identical artifacts. It does
not replace chunk integrity checks or detached signatures.

## Vite Builds

The Vite plugin inherits the deterministic behavior of `packDirectory`.

Stable Vite payload bytes require:

- stable files under the configured `input` directory;
- stable `manifestPath`, `ignore`, compression, integrity, and metadata options;
- deterministic compression codecs if custom codecs are used.

Vite's JavaScript asset filenames can still include bundler-controlled content
hashes. For single-file ByteDist checks, compare the embedded payload bytes or a
`computePayloadHash` result rather than the full generated HTML file.
