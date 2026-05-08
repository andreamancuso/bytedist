# ByteDist Payload Format

This document describes the current ByteDist payload format version `0`.

ByteDist is a binary payload format for packaging application-owned manifests and
resources. It is designed for runtime reading, integrity checks, and embedding in
offline-capable web artifacts. It is not DRM, encryption, anti-piracy technology,
or a place to store secrets.

## Layout

A ByteDist payload is laid out as:

```text
Header | ChunkDataRegion | TocRegion | Footer
```

The writer stores chunk bytes first, then writes the table of contents (TOC),
then writes the footer. The footer points back to the TOC, so readers can inspect
the end of the file first and locate metadata without scanning the whole payload.

All fixed-width integer fields are little-endian. Multi-byte integer values must
fit JavaScript's safe integer range when exposed through the TypeScript reader.

## Header

The header is `24` bytes.

| Offset | Size | Field          | Current value    | Notes                                   |
| ------ | ---: | -------------- | ---------------- | --------------------------------------- |
| `0`    |  `8` | magic          | ASCII `BDISTPAY` | Identifies a ByteDist payload.          |
| `8`    |  `4` | format version | `0`              | Unsupported versions are rejected.      |
| `12`   |  `4` | header length  | `24`             | Allows future header expansion.         |
| `16`   |  `4` | flags          | `0`              | No payload flags are currently defined. |
| `20`   |  `4` | reserved       | `0`              | Must be zero in version `0`.            |

## Chunk Data Region

The chunk data region starts immediately after the header at byte offset `24`.
Each chunk record in the TOC stores the byte offset and stored byte length for
one chunk.

Chunk records also store both:

- `length`: the logical uncompressed byte length;
- `storedLength`: the number of bytes stored in the chunk data region.

For uncompressed chunks, `length` and `storedLength` are equal. For compressed
chunks, `storedLength` can be smaller or larger than `length`, depending on the
codec and compression mode used by the writer.

## TOC Region

The TOC region is currently UTF-8 JSON. The v0 writer emits
`tocEncoding: "json"`, and readers reject missing or unsupported TOC encodings
instead of guessing. The TOC shape is:

```json
{
  "version": 0,
  "tocEncoding": "json",
  "createdBy": "optional writer name",
  "manifest": { "path": "manifest.json" },
  "chunks": [],
  "metadata": {}
}
```

Required fields:

- `version`: must be `0`;
- `tocEncoding`: must be `json`;
- `chunks`: an array of chunk records.

Optional fields:

- `createdBy`: a writer identifier for debugging;
- `manifest`: currently `{ "path": "manifest.json" }` when `createPayload`
  generated a manifest chunk;
- `metadata`: caller-owned JSON metadata.

### TOC Encoding Decision

Stage 17 measured TOC size and parse/stringify cost with:

```sh
npm run toc:measure
```

JSON remains the only supported v0 TOC encoding. It is easy to inspect, keeps the
TypeScript and WASM readers simple, and avoids adding a second schema before
there is measured pressure from large payloads, range loading, or browser memory
limits.

If ByteDist later adds a binary TOC, the preferred direction is a small custom
record format that can be implemented consistently in TypeScript and WASM. CBOR,
MessagePack, Protocol Buffers, and FlatBuffers remain deferred because they add
dependency, bundling, schema-evolution, and cross-runtime complexity before the
project has evidence that JSON is the bottleneck.

## Chunk Records

Each TOC chunk record describes one stored resource:

```json
{
  "name": "assets/example.bin",
  "offset": 24,
  "length": 1024,
  "storedLength": 1024,
  "mime": "application/octet-stream",
  "encoding": "utf-8",
  "compression": "none",
  "hash": {
    "algorithm": "sha256",
    "value": "..."
  },
  "metadata": {}
}
```

Required fields:

- `name`: chunk name;
- `offset`: absolute byte offset in the payload;
- `length`: logical uncompressed byte length;
- `storedLength`: stored byte length;
- `compression`: compression codec name.

Optional fields:

- `mime`: media type hint;
- `encoding`: text encoding hint;
- `hash`: per-chunk integrity metadata;
- `metadata`: caller-owned JSON metadata.

## Chunk Names

Chunk names are case-sensitive and use forward slashes. Valid names:

- are non-empty;
- are relative paths;
- do not start or end with `/`;
- do not contain empty path segments;
- do not contain `.` or `..` path segments;
- do not contain backslashes;
- do not contain Windows drive prefixes such as `C:/`;
- are Unicode-normalized NFC strings;
- are unique within one payload.

When `createPayload({ manifest })` is used, ByteDist generates a `manifest.json`
chunk and stores `toc.manifest.path` as `manifest.json`. Callers must not also
provide an explicit `manifest.json` file in that mode.

## Footer

The footer is `40` bytes and is always at the end of the payload.

| Offset | Size | Field          | Current value    | Notes                                      |
| ------ | ---: | -------------- | ---------------- | ------------------------------------------ |
| `0`    |  `8` | magic          | ASCII `BDISTEND` | Identifies the footer.                     |
| `8`    |  `4` | format version | `0`              | Must match a supported format version.     |
| `12`   |  `8` | TOC offset     | variable         | Absolute byte offset of the TOC.           |
| `20`   |  `8` | TOC length     | variable         | TOC byte length.                           |
| `28`   |  `8` | payload length | variable         | Must equal the actual payload byte length. |
| `36`   |  `4` | TOC CRC32      | variable         | CRC32 of the TOC bytes.                    |

The TOC CRC32 is a corruption/debugging check, not a cryptographic integrity
mechanism. Cryptographic chunk integrity is represented by per-chunk SHA-256
metadata.

## Integrity

When SHA-256 integrity is enabled, each chunk record includes:

```json
{
  "hash": {
    "algorithm": "sha256",
    "value": "64 lowercase hex characters"
  }
}
```

Hashes cover logical uncompressed chunk bytes. For compressed chunks, readers
decompress first and then compare the SHA-256 digest. Payloads without hash
metadata are still readable, but `archive.verify()` reports missing integrity
metadata.

## Compression

The built-in compression codec is `none`.

Other compression names are adapter-based. A reader can parse the TOC for a
compressed chunk without having the codec, but reading or verifying that chunk
requires a matching codec adapter. Missing codecs produce a compression error.

Codec names are short lowercase identifiers using letters, digits, and `-`.
The name `none` is reserved.

Writer behavior:

- payload-level `compression` applies to every chunk unless a file overrides it;
- file-level `compression` overrides the payload default;
- default `compressionMode` is `smaller`;
- if compression does not reduce size in `smaller` mode, the writer stores the
  original bytes and records `compression: "none"`;
- `compressionMode: "always"` stores codec output even when larger.

Built-in gzip, deflate, and zstd adapters are not part of format version `0`.

## Debugging A Payload

A tiny payload with one one-byte chunk has this rough shape:

```text
0000  42 44 49 53 54 50 41 59  00 00 00 00 18 00 00 00  BDISTPAY........
0010  00 00 00 00 00 00 00 00  61                       ........a
0019  7b ... json toc bytes ... 7d                       {...}
....  42 44 49 53 54 45 4e 44  00 00 00 00 ...           BDISTEND....
```

Debugging checklist:

1. Check byte `0..7` for `BDISTPAY`.
2. Check the final `40` bytes for footer magic `BDISTEND`.
3. Read footer `payload length` and compare it with the actual file length.
4. Read footer `TOC offset` and `TOC length`, then slice those bytes.
5. Compute CRC32 over the TOC bytes and compare with footer `TOC CRC32`.
6. Decode the TOC as UTF-8 JSON and inspect chunk ranges.
7. For hashed chunks, verify SHA-256 against logical uncompressed bytes.

Common failure modes:

- bad header or footer magic usually means the file is not a ByteDist payload or
  the wrong bytes were selected;
- payload length mismatch suggests truncation or appended data;
- TOC range errors suggest a corrupted footer;
- TOC CRC32 mismatch suggests TOC byte corruption;
- SHA-256 mismatch suggests chunk byte corruption or tampering;
- missing compression codec means the payload can be parsed but selected chunks
  cannot be read until a codec is supplied.

## Compatibility

Payload format version `0` is pre-1.0. The project will reject unsupported
format versions rather than guessing.

Until ByteDist reaches a stable 1.0 format:

- keep source assets and manifests available so payloads can be repacked;
- do not assume version `0` payloads will be readable forever by future major
  readers;
- minor implementation details of the JSON TOC may change while the format is
  still experimental;
- public APIs should remain conservative, but payload compatibility is not yet a
  long-term archival guarantee.

ByteDist is intended to make packaging, runtime reading, and integrity checks
practical for web artifacts. It does not make client-delivered bytes secret or
impossible to extract.
