# Security Policy

ByteDist is an asset-packaging toolkit for offline-capable web artifacts. It is
not DRM, encryption, anti-piracy technology, a tamper-proof package, or a trusted
execution environment.

## Security Model

ByteDist can provide a clean packaging boundary, payload integrity checks, and a
practical deterrence layer against casual extraction. It cannot prevent
determined extraction from client-delivered artifacts.

Standalone HTML artifacts and browser-delivered payloads contain both the bytes
and the runtime needed to read those bytes. A determined user can inspect memory,
patch JavaScript or WASM loaders, intercept object URL creation, modify
verification code, or use browser developer tools.

## Do Not Store Secrets

Do not put credentials, private keys, license secrets, hidden access tokens, or
other secrets in ByteDist payloads. Treat any browser-delivered artifact as
inspectable by the recipient.

## Integrity

Integrity checks can detect corruption or tampering only when the verifier and
its execution environment are trusted. Integrity is not the same as access
control.

ByteDist's v0 footer CRC32 is a non-cryptographic corruption check for TOC bytes.
It is not an authenticity check and does not prove that a payload came from a
trusted publisher.

If signing is added in a later release, signatures will prove provenance only
under a clearly documented key and trust model.

## WASM

WASM support is an experimental narrow reader/validator path for hardened
standalone artifacts. WASM is not a security boundary. It can raise
implementation friction and help keep parsing behavior consistent, but it does
not make assets unextractable.

## Reporting Vulnerabilities

This project is pre-release. Please report vulnerabilities or security-relevant
design issues by opening a private advisory if the hosting platform supports it,
or by contacting the maintainers through the repository's published security
contact once one is available.
