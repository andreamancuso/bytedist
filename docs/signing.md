# ByteDist Signing

ByteDist supports detached payload signatures for provenance checks. A signature
file proves that a payload's signed metadata matched a private key holder's
intent at signing time, assuming the verifier trusts the public key and the
verification environment.

Signing is not DRM, encryption, access control, or a way to make
client-delivered assets secret. Do not put private keys or other secrets in
browser exports.

## Model

The current signing format is detached JSON. Signing a payload does not rewrite
the `.bytedist` file and does not change payload format version `0`.

The signature envelope contains:

- envelope format and version;
- algorithm: `ECDSA-P256-SHA256`;
- canonical provenance for the payload;
- base64url signature bytes.

The provenance object includes:

- payload format version;
- payload byte length;
- TOC encoding, offset, length, CRC32, and SHA-256;
- payload-level manifest reference and metadata;
- chunk names, offsets, lengths, compression names, metadata, and SHA-256
  hashes.

Payloads must contain SHA-256 chunk hash metadata before they can be signed.
Hashless payloads remain readable, but signing rejects them.

## CLI

Generate an ECDSA P-256 private/public key pair with tooling you trust. The CLI
expects PKCS#8 private keys and SPKI public keys in PEM format.

Sign a payload:

```sh
bytedist sign demo.bytedist --key private.pem --out demo.bytedist.sig.json
```

Verify a payload and detached signature:

```sh
bytedist verify-signature demo.bytedist --key public.pem --signature demo.bytedist.sig.json
```

`verify-signature` fails if:

- the public key does not match the signature;
- the payload bytes changed after signing;
- the signature JSON was modified;
- required SHA-256 chunk metadata is missing;
- normal payload integrity verification fails.

The existing `bytedist verify` command remains an integrity-only check and does
not require a public key.

## TypeScript API

```ts
import {
  parseSignatureEnvelope,
  signPayload,
  stringifySignatureEnvelope,
  verifyPayloadSignature
} from "bytedist";

const envelope = await signPayload(payloadBytes, privateKeyPem);
const signatureJson = stringifySignatureEnvelope(envelope);

await verifyPayloadSignature(payloadBytes, parseSignatureEnvelope(signatureJson), publicKeyPem);
```

The TypeScript API uses platform WebCrypto. Browser verification should receive
public keys only. The `bytedist/browser` entrypoint exports
`parseSignatureEnvelope` and `verifyPayloadSignature`, but not `signPayload`.
Private keys are for build or publishing systems, not runtime exports.

## Trust Model

Signatures prove provenance only when the caller has a trustworthy public key
distribution story. A signature can say "this payload was signed by the holder
of the matching private key"; it cannot say that the signer is trustworthy by
itself.

For standalone HTML or browser-delivered artifacts, the verifier code is also
client-delivered. A determined user can modify or bypass that verifier. Treat
signature checks in those artifacts as corruption/provenance signals for honest
execution environments, not as a security boundary.
