# Compatibility Matrix

ByteDist targets modern JavaScript runtimes and ESM-first tooling. The payload
format is still pre-1.0, so this matrix describes current implementation support
rather than a long-term archival compatibility promise.

## Browser Compatibility

Target browsers:

| Runtime            | Status                        | Notes                                                             |
| ------------------ | ----------------------------- | ----------------------------------------------------------------- |
| Current Chromium   | Targeted                      | Includes Chrome and Chromium-based browsers.                      |
| Current Edge       | Targeted                      | Follows the Chromium browser path.                                |
| Current Firefox    | Targeted                      | Use the standard full-buffer and embedded loading helpers.        |
| Current Safari     | Targeted with caveats         | Measure memory for larger embedded payloads.                      |
| Current iOS Safari | Practical target with caveats | Prefer smaller embedded payloads and explicit object URL cleanup. |

Browser helpers rely on conservative APIs:

- `Uint8Array`, `ArrayBuffer`, and `DataView`;
- `TextEncoder` and `TextDecoder`;
- `Blob` and `URL.createObjectURL`;
- `fetch` for URL loading;
- HTTP `Range` support for `openPayloadFromUrlRange`;
- `WebAssembly.instantiate` for optional WASM reader paths.

Known caveats:

- Embedded single-file payloads are base64 text and require a full decode before
  opening.
- Safari and mobile browsers should be measured with representative payload
  sizes before choosing single-file embedding for large artifacts.
- Object URLs should be revoked when resources are no longer displayed.
- WebCrypto availability can vary for standalone `file://` workflows, so
  integrity hashing keeps a Node fallback where relevant and signing should be
  tested in the target browser context.
- Range loading needs a hosted external payload and a server that honors byte
  range requests.

Browser compatibility is currently documented and manually verifiable through
the examples. Automated Playwright coverage is deferred.

## Node Compatibility

The package requires Node.js `>=20`.

CI verifies:

| Node.js | Status         |
| ------- | -------------- |
| 20      | Tested minimum |
| 22      | Tested         |

Node-only helpers are exported from `bytedist/node`. Browser-oriented consumers
should use `bytedist/browser`, `bytedist/html`, or `bytedist/wasm` as needed and
avoid importing Node entrypoints into browser bundles.

## Bundler Compatibility

ByteDist is ESM-first and uses package exports.

| Tooling path | Status   | Notes                                                               |
| ------------ | -------- | ------------------------------------------------------------------- |
| Vite         | Tested   | `bytedist/vite` has a build-only plugin and a repo example.         |
| No bundler   | Tested   | Examples cover Node scripts and static single-file HTML.            |
| webpack      | Expected | Use ESM package exports; not continuously tested yet.               |
| Rollup       | Expected | Core/browser/html entrypoints are ESM; not continuously tested yet. |
| esbuild      | Expected | Core/browser/html entrypoints are ESM; not continuously tested yet. |

The core package does not require Vite. The Vite plugin is optional and keeps
Vite as an optional peer dependency. The published peer range is
`^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0-0`; the plugin remains build-only and the
repo's continuous tests currently run against the dev dependency version.

## Manual Smoke Checks

For browser compatibility checks, build the examples and open the generated
artifacts in the target browser:

```sh
npm run example:browser-gallery
npm run example:single-file-html
npm run example:vite
```

Useful checks:

- external `.bytedist` file loads through file input or fetch;
- embedded payload opens from a local HTML file where practical;
- images or other binary resources render through object URLs;
- integrity failures produce readable errors;
- WASM reader initialization fails clearly when WASM is unavailable.
