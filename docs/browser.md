# Browser Loading

ByteDist browser helpers are exported from `bytedist/browser`.

See [`compatibility.md`](compatibility.md) for the current browser target matrix,
runtime API assumptions, and manual smoke-test guidance.

## Full-Buffer Loading

`loadPayloadFromUrl`, `loadPayloadFromBlob`, `loadPayloadFromFile`, and
`openEmbeddedPayload` load the full payload bytes before opening the archive.
This is the simplest path and works for embedded single-file HTML artifacts.

Load an external payload with `fetch`:

```ts
import { loadPayloadFromUrl } from "bytedist/browser";

const archive = await loadPayloadFromUrl("artifact.bytedist");
await archive.verify();

const manifest = await archive.readJson<{ title: string; image: string }>("manifest.json");
const imageBytes = await archive.readBytes(manifest.image);
```

Load a payload selected through a file input:

```ts
import { loadPayloadFromFile } from "bytedist/browser";

const input = document.querySelector<HTMLInputElement>("input[type=file]");
const file = input?.files?.[0];

if (file) {
  const archive = await loadPayloadFromFile(file);
  console.log(archive.list());
}
```

Embedded payloads are stored as non-executable base64 data blocks. They generally
require full base64 decode before the archive can be opened, so applications
should account for the extra encoded size and temporary memory overhead. This is
portable for standalone `file://` workflows, but it is not a streaming mode.

Open the default embedded payload block:

```ts
import { openEmbeddedPayload } from "bytedist/browser";

const archive = await openEmbeddedPayload();
const manifest = await archive.readJson("manifest.json");
```

See [`single-file-html.md`](single-file-html.md) for embedding options and
single-file tradeoffs.

## Reading Chunks

The browser archive API matches the TypeScript reference reader:

```ts
const manifest = await archive.readJson("manifest.json");
const title = await archive.readText("content/title.txt");
const audioBytes = await archive.readBytes("media/intro.mp3");
```

`readBytes` returns a defensive copy. Mutating the returned `Uint8Array` does not
change the archive.

## HTTP Range Loading

`openPayloadFromUrlRange` opens an external `.bytedist` payload through HTTP
byte ranges:

```ts
import { openPayloadFromUrlRange } from "bytedist/browser";

const archive = await openPayloadFromUrlRange("artifact.bytedist");
const manifest = await archive.readJson("manifest.json");
const imageBytes = await archive.readBytes("c/image-001");
```

The range reader:

- requests the footer first with `Range: bytes=-40`;
- requests the header and TOC ranges next;
- fetches selected chunk byte ranges on `readBytes`;
- verifies chunks lazily during `verify`;
- falls back to full-buffer loading when the first range request receives a
  normal `200 OK` response.

Range loading is useful for hosted external payloads when the server supports
byte ranges. It is not used for embedded single-file HTML payloads.

Compatibility notes:

- the server must return `206 Partial Content` for range requests;
- cross-origin range loading requires the same CORS permissions as ordinary
  `fetch` calls;
- unsupported range responses fall back to full-buffer loading;
- embedded payloads cannot use HTTP ranges because the bytes are already inside
  the HTML document.

## Cache Behavior

By default, range-loaded chunks are not cached:

```ts
await openPayloadFromUrlRange("artifact.bytedist", { cache: "none" });
```

Repeated reads refetch and, when needed, decompress the selected chunk again. To
cache logical read bytes by chunk name:

```ts
await openPayloadFromUrlRange("artifact.bytedist", { cache: "bytes" });
```

`cache: "bytes"` can reduce repeated network and decompression work, but it
keeps chunk bytes in memory until the archive is closed. Prefer the default for
large media payloads or memory-constrained browsers.

## Object URLs

Use `createChunkObjectUrl` to display media bytes as browser resources. Revoke
object URLs when they are no longer needed:

```ts
import { createChunkObjectUrl } from "bytedist/browser";

const resource = await createChunkObjectUrl(archive, "c/image-001");
img.src = resource.url;

resource.revoke();
```

The helper preserves a chunk MIME type when one is present in the TOC. Pass an
explicit MIME type when the payload does not provide one:

```ts
const resource = await createChunkObjectUrl(archive, "c/audio-001", {
  type: "audio/mpeg"
});
```

Object URLs are process-local browser resources. Revoke them when an image,
audio element, or download link no longer needs the bytes.
