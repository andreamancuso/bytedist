# WASM Reader

ByteDist includes an experimental narrow WASM reader/validator path for hardened
standalone artifacts.

The WASM reader exists to:

- keep a small format-validation path available outside JavaScript;
- make casual source inspection less direct for standalone HTML artifacts;
- provide a future bridge for C/C++ consumers;
- test payload parsing behavior against the TypeScript reference reader.

It is not a security boundary. It does not make client-delivered assets
unextractable, and it must not be used to store secrets in a browser-delivered
artifact.

## Current Scope

The current MVP WASM reader can:

- validate payload header and footer magic;
- reject unsupported payload format versions;
- validate footer payload length and TOC ranges;
- verify the footer CRC32 for TOC bytes;
- parse the JSON TOC;
- validate chunk names, duplicate chunk names, and chunk byte ranges;
- list chunk names;
- read selected uncompressed chunks by name or opaque ID.

Compressed chunk reads, SHA-256 verification, and a stable public JavaScript
wrapper are intentionally deferred. The TypeScript reader remains the canonical
reference implementation.

## Build

The WASM build uses Docker and Emscripten:

```sh
npm run wasm:build
npm run wasm:test
```

The build uses `emscripten/emsdk:5.0.2` and writes generated files under
`wasm/dist/`. Generated WASM files are ignored by Git until the package
distribution shape is finalized.

## ABI Status

The exported ABI is internal and may change before a public release. Consumers
should use the TypeScript APIs unless they are testing the experimental WASM
path directly.
