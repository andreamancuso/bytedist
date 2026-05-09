# ByteDist Docs

ByteDist is a toolkit for packaging application-owned manifests and resources
into portable web artifacts. A `.bytedist` asset package can be inspected,
verified, loaded in browsers, and embedded into single-file HTML exports.

## Start Here

- [`getting-started.md`](getting-started.md): install, pack, inspect, verify,
  and read a `.bytedist` file.
- [`security-model.md`](security-model.md): what ByteDist does and does not
  protect.
- [`format.md`](format.md): binary layout, TOC shape, chunk naming, integrity,
  and compatibility notes.
- [`browser.md`](browser.md): browser loading, embedded `.bytedist` files, HTTP
  ranges, and object URLs.
- [`single-file-html.md`](single-file-html.md): embedding payloads into
  standalone HTML files.

## Reference Guides

- [`metadata-and-manifests.md`](metadata-and-manifests.md): conventional
  manifest names, payload metadata, and reserved namespaces.
- [`deterministic-builds.md`](deterministic-builds.md): reproducible payload
  output and whole-payload hashes.
- [`signing.md`](signing.md): detached provenance signatures and trust model.
- [`extraction-safety.md`](extraction-safety.md): internal extraction path and
  overwrite defenses.
- [`performance.md`](performance.md): local benchmark tooling and artifact-size
  tradeoffs.
- [`compatibility.md`](compatibility.md): Node, browser, and bundler support
  matrix.
- [`vite.md`](vite.md): optional Vite plugin usage.
- [`wasm.md`](wasm.md): experimental WASM reader wrapper and runtime notes.

## Adoption Paths

For a Node or CLI workflow, start with
[`getting-started.md`](getting-started.md), then read
[`format.md`](format.md) and [`performance.md`](performance.md).

For a browser workflow, start with [`browser.md`](browser.md), then read
[`single-file-html.md`](single-file-html.md) if the artifact must open directly
from disk.

For security and trust-boundary guidance, read
[`security-model.md`](security-model.md),
[`metadata-and-manifests.md`](metadata-and-manifests.md), [`signing.md`](signing.md),
and [`wasm.md`](wasm.md). ByteDist can provide packaging, integrity checks, and
cleaner artifact boundaries, but it is not DRM and must not contain client-side
secrets.
