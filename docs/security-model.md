# Security Model

ByteDist is an asset-packaging toolkit. It provides a versioned binary payload
format, integrity checks, optional detached signatures, browser loading helpers,
single-file HTML embedding, and an experimental WASM reader path.

ByteDist is not DRM, encryption, anti-piracy technology, a trusted execution
environment, or a tamper-proof packaging system.

## What ByteDist Helps With

ByteDist is designed to help applications:

- package an application-defined manifest and binary resources into one payload;
- keep standalone HTML exports cleaner than large inline JSON or obvious media
  data URLs in executable JavaScript;
- use opaque chunk IDs for hardened exports;
- verify chunk hashes and TOC corruption metadata;
- optionally verify detached provenance signatures;
- read resources through a narrow runtime API.

This can raise the effort required for casual extraction and can make corruption
or unexpected changes easier to detect.

## What ByteDist Does Not Protect

A standalone client-delivered artifact contains the bytes and runtime needed to
render itself. A determined user can still extract assets by:

- patching JavaScript or WASM loaders;
- intercepting `readBytes`, `Blob`, or object URL creation;
- inspecting decoded `ArrayBuffer` values in browser tools;
- dumping WebAssembly memory;
- bypassing or replacing integrity checks;
- recording screen or audio output.

Do not put secrets in ByteDist payloads. This includes credentials, private keys,
license secrets, hidden access tokens, unreleased source assets, or server-only
business rules.

## Integrity Checks

ByteDist v0 uses:

- TOC CRC32 metadata to detect accidental TOC byte corruption;
- optional per-chunk SHA-256 hashes to verify chunk contents;
- whole-payload SHA-256 helper APIs for reproducible-build workflows.

CRC32 is not cryptographic. SHA-256 can detect changed bytes, but integrity is
only meaningful when the verifier and expected metadata are trusted. In a
standalone HTML artifact, a user who can edit the runtime can also edit or skip
the verification logic.

## Signatures

Detached signatures can prove that a payload matches a provenance envelope under
a trusted public key. They do not hide payload contents and do not prevent
extraction.

In browser-delivered artifacts, public keys may be embedded for verification.
Private signing keys must stay outside the artifact and outside client-side
runtime code.

## WASM Reader Path

The WASM reader/validator is a narrow runtime path for validating and reading
payloads from standalone artifacts. It can provide a smaller, less convenient
surface than plain JavaScript parsing, but WASM is not a security boundary.

Treat WASM as validation and deterrence, not as a way to keep secrets from users
who have the artifact.

## Hardened Export Terminology

In ByteDist docs, hardening means practical packaging choices such as:

- opaque chunk IDs instead of friendly source filenames;
- minimized public manifests;
- no local paths or source URLs unless the application intentionally includes
  them;
- SHA-256 chunk hashes;
- detached signatures when provenance matters;
- embedded payload bytes stored in non-executable data blocks;
- optional WASM validation in standalone runtimes.

Hardening does not mean unbreakable protection. It means the artifact is cleaner,
less casually inspectable, and easier to verify within the limits of
client-delivered software.

## Reporting Security Issues

Report vulnerabilities through the process in [`../SECURITY.md`](../SECURITY.md).
Do not publish exploit details before maintainers have had a reasonable chance
to investigate.
