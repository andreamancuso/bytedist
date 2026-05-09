# Single-File HTML

ByteDist can embed a `.bytedist` payload into an HTML file as a non-executable
base64 data block. This is useful for artifacts that must open directly from disk
without a server.

## CLI Bundling

Create a template with a payload marker:

```html
<!doctype html>
<html lang="en">
  <body>
    <main id="app"></main>
    <!-- BYTEDIST_PAYLOAD -->
    <script type="module" src="./viewer.js"></script>
  </body>
</html>
```

Bundle an existing payload into the template:

```sh
npx bytedist bundle-html \
  --template index.html \
  --payload artifact.bytedist \
  --out standalone.html
```

`bundle-html` replaces `<!-- BYTEDIST_PAYLOAD -->` with a script block similar
to:

```html
<script type="application/octet-stream+base64" data-bytedist-payload>
  ...
</script>
```

Optional runtime JavaScript and WASM data blocks are inserted with
`<!-- BYTEDIST_RUNTIME -->` and `<!-- BYTEDIST_WASM -->`.

## Programmatic Embedding

Use `bytedist/html` when an application or build script owns the HTML assembly:

```ts
import { embedPayloadInHtml } from "bytedist/html";

const html = embedPayloadInHtml(templateHtml, payloadBytes);
```

At runtime, use the browser helper:

```ts
import { openEmbeddedPayload } from "bytedist/browser";

const archive = await openEmbeddedPayload();
const manifest = await archive.readJson("manifest.json");
```

## Size And Memory

Base64 increases the encoded payload size by roughly one third before HTML,
runtime JavaScript, and any embedded WASM bytes are counted.

Embedded payloads are portable, but they usually require temporary memory for:

- the HTML source;
- the base64 text;
- decoded payload bytes;
- chunk bytes read by the application;
- object URLs created for browser resources.

For large artifacts, prefer an external `.bytedist` file with
[`openPayloadFromUrlRange`](browser.md#http-range-loading) when the artifact is
hosted on a server that supports byte ranges.

## Local File Opening Caveats

The single-file path is designed to work from `file://`, but browser rules still
matter:

- external module imports may be blocked or unavailable from local files, so
  standalone artifacts should inline or bundle their runtime;
- WebCrypto availability can depend on secure-context rules, so do not make
  standalone startup rely exclusively on browser `crypto.subtle`;
- large embedded payloads can stress mobile browsers and Safari memory limits;
- service workers and network-only APIs should not be required.

Use clear runtime error messages for payload decode, WASM initialization,
verification, and resource-read failures.

## Embedded vs External Payloads

Prefer embedded payloads when:

- the artifact must be one file;
- the payload is modest in size;
- offline disk opening is more important than network caching or range reads.

Prefer an external `.bytedist` payload when:

- payloads are large;
- several HTML shells share the same resources;
- HTTP caching matters;
- range reads can avoid loading every chunk.

## Security Notes

Single-file HTML artifacts contain the runtime and the bytes needed to render the
artifact. ByteDist can avoid obvious inline media data URLs in executable
JavaScript and can use opaque chunk IDs, but it cannot prevent determined users
from extracting client-delivered assets. Do not place secrets, private keys,
credentials, or hidden access tokens in embedded payloads.
