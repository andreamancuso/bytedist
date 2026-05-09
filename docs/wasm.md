# WASM Reader

ByteDist includes an experimental narrow WASM reader/validator path for hardened
standalone artifacts. The TypeScript reader remains the canonical reference
implementation.

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

Compressed chunk reads are intentionally deferred in the WASM path. The
JavaScript wrapper performs SHA-256 verification by reading chunk bytes through
WASM and hashing them with the existing TypeScript integrity helper.

## JavaScript Wrapper

The experimental wrapper is exported from `bytedist/wasm`:

```ts
import { openPayloadWithWasm } from "bytedist/wasm";
import createByteDistWasmModule from "./bytedist_wasm.mjs";

const archive = await openPayloadWithWasm(payloadBytes, {
  moduleFactory: createByteDistWasmModule
});

const names = archive.list();
const manifest = await archive.readJson("manifest.json");
await archive.verify();
archive.close();
```

The wrapper returns an `OpenedPayload`-compatible object. Consumers do not need
to allocate raw WASM memory, pass pointers, or read exported memory directly.

For embedded standalone HTML workflows, the wrapper can use the existing
non-executable payload and WASM data blocks:

```ts
import { openEmbeddedPayloadWithWasm } from "bytedist/wasm";
import createByteDistWasmModule from "./bytedist_wasm.mjs";

const archive = await openEmbeddedPayloadWithWasm({
  moduleFactory: createByteDistWasmModule
});
```

If a workflow wants an explicit TypeScript fallback, pass
`fallback: "typescript"`. Fallback is opt-in so WASM initialization failures are
visible by default.

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

The exported native ABI is internal and may change before a public release.
Consumers should use the TypeScript wrapper instead of calling these functions
directly.

Current exported functions:

- `bd_malloc(length)` and `bd_free(ptr)` allocate and free caller-owned input
  buffers.
- `bd_open(ptr, len)` copies payload bytes into native-owned archive storage and
  returns a handle.
- `bd_close(handle)` releases archive state for that handle.
- `bd_chunk_count(handle)`, `bd_chunk_name_ptr(handle, index)`, and
  `bd_chunk_name_len(handle, index)` expose native-owned chunk-name views.
- `bd_toc_json_ptr(handle)` and `bd_toc_json_len(handle)` expose a native-owned
  TOC JSON view for wrapper parsing.
- `bd_read_chunk(handle, namePtr, nameLen)` stores the selected chunk in a
  native-owned result buffer.
- `bd_result_ptr(handle)` and `bd_result_len(handle)` expose the most recent
  native-owned read result.
- `bd_last_error_code()`, `bd_last_error_message_ptr()`, and
  `bd_last_error_message_len()` expose the latest error.

Memory ownership rules:

- pointers returned by `bd_malloc` must be released with `bd_free`;
- pointers returned by name, TOC, result, and error functions are native-owned
  and must not be freed by callers;
- name and TOC views remain valid until `bd_close(handle)`;
- result views remain valid until the next `bd_read_chunk` for the same handle
  or `bd_close(handle)`;
- error-message views remain valid until the next ABI call that updates the
  error state.
