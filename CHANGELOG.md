# Changelog

All notable changes to ByteDist will be documented in this file.

ByteDist package versions follow SemVer. The `.bytedist` payload format has a
separate format version; the current payload format is version `0` and remains
pre-1.0.

## 0.1.0-alpha.2 - 2026-05-09

### Changed

- Replaced the experimental WASM reader's embedded custom JSON parser with
  vendored yyjson `0.12.0` for JSON TOC parsing.

## 0.1.0-alpha.1 - 2026-05-09

### Fixed

- Widened the optional Vite peer dependency range to support consumers using
  Vite 5, 6, 7, and 8 prerelease/current lines without npm `ERESOLVE` failures.

## 0.1.0-alpha.0 - 2026-05-09

First alpha release.

### Added

- TypeScript writer and reference reader for payload format version `0`.
- Node directory packing helpers and CLI commands for `pack`, `inspect`,
  `verify`, `sign`, `verify-signature`, and `bundle-html`.
- Browser loading helpers for full-buffer payloads, embedded payload blocks,
  file/blob inputs, object URLs, and HTTP range loading.
- Single-file HTML embedding helpers using non-executable payload data blocks.
- SHA-256 chunk integrity metadata, TOC corruption checks, deterministic output
  controls, whole-payload hashing, and detached signature envelopes.
- Optional compression codec adapter plumbing with `none` as the dependency-free
  default.
- Experimental WASM reader/validator wrapper and Emscripten build scripts.
- Optional Vite build plugin and generic runnable examples.
- Public docs for format, getting started, browser loading, single-file HTML,
  metadata conventions, signing, WASM, Vite, performance, compatibility,
  extraction safety, deterministic builds, and the security model.

### Notes

- This alpha is intended for early integration and feedback.
- Package APIs and payload format version `0` may still change before 1.0.
- ByteDist is not DRM, encryption, anti-piracy technology, or a tamper-proof
  packaging system.
