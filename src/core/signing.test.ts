import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PAYLOAD_HEADER_LENGTH, PayloadIntegrityMismatchError } from "../index.js";
import { PayloadSignatureError } from "../format/index.js";
import { createPayload } from "./pack.js";
import {
  createPayloadSignatureProvenance,
  parseSignatureEnvelope,
  signPayload,
  stringifySignatureEnvelope,
  verifyPayloadSignature
} from "./signing.js";

describe("payload signatures", () => {
  it("signs and verifies a payload provenance envelope", async () => {
    const keys = createSigningKeys();
    const payload = await createSignedPayload();

    const envelope = await signPayload(payload, keys.privateKeyPem);

    expect(envelope.algorithm).toBe("ECDSA-P256-SHA256");
    expect(envelope.provenance.payloadLength).toBe(payload.byteLength);
    expect(envelope.provenance.payloadFormatVersion).toBe(0);
    expect(envelope.provenance.toc.encoding).toBe("json");
    expect(envelope.provenance.toc.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.provenance.chunks).toEqual([
      expect.objectContaining({
        name: "manifest.json",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }),
      expect.objectContaining({
        name: "assets/a.txt",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    ]);

    await expect(
      verifyPayloadSignature(payload, envelope, keys.publicKeyPem)
    ).resolves.toBeUndefined();
  });

  it("round-trips signature envelopes through canonical JSON", async () => {
    const keys = createSigningKeys();
    const payload = await createSignedPayload();
    const envelope = await signPayload(payload, keys.privateKeyPem);

    const parsed = parseSignatureEnvelope(stringifySignatureEnvelope(envelope));

    expect(parsed).toEqual(envelope);
    expect(stringifySignatureEnvelope(parsed)).toBe(stringifySignatureEnvelope(envelope));
  });

  it("rejects signing hashless payloads", async () => {
    const keys = createSigningKeys();
    const payload = await createPayload({
      integrity: false,
      files: [
        {
          name: "a.txt",
          bytes: textBytes("hello")
        }
      ]
    });

    await expect(signPayload(payload, keys.privateKeyPem)).rejects.toThrow("no integrity metadata");
  });

  it("rejects a payload whose bytes changed after signing", async () => {
    const keys = createSigningKeys();
    const payload = await createSignedPayload();
    const envelope = await signPayload(payload, keys.privateKeyPem);
    const tampered = payload.slice();
    tampered[PAYLOAD_HEADER_LENGTH] = tampered[PAYLOAD_HEADER_LENGTH] === 123 ? 124 : 123;

    await expect(verifyPayloadSignature(tampered, envelope, keys.publicKeyPem)).rejects.toThrow(
      PayloadIntegrityMismatchError
    );
  });

  it("rejects an envelope whose provenance changed", async () => {
    const keys = createSigningKeys();
    const payload = await createSignedPayload();
    const envelope = await signPayload(payload, keys.privateKeyPem);
    const tamperedEnvelope = {
      ...envelope,
      provenance: {
        ...envelope.provenance,
        payloadLength: envelope.provenance.payloadLength + 1
      }
    };

    await expect(
      verifyPayloadSignature(payload, tamperedEnvelope, keys.publicKeyPem)
    ).rejects.toThrow(PayloadSignatureError);
  });

  it("rejects the wrong public key", async () => {
    const keys = createSigningKeys();
    const wrongKeys = createSigningKeys();
    const payload = await createSignedPayload();
    const envelope = await signPayload(payload, keys.privateKeyPem);

    await expect(verifyPayloadSignature(payload, envelope, wrongKeys.publicKeyPem)).rejects.toThrow(
      PayloadSignatureError
    );
  });

  it("generates stable provenance for an unchanged payload", async () => {
    const payload = await createSignedPayload();

    await expect(createPayloadSignatureProvenance(payload)).resolves.toEqual(
      await createPayloadSignatureProvenance(payload)
    );
  });
});

function createSigningKeys(): {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    }
  });

  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey
  };
}

function createSignedPayload(): Promise<Uint8Array> {
  return createPayload({
    manifest: { entry: "assets/a.txt" },
    integrity: "sha256",
    files: [
      {
        name: "assets/a.txt",
        bytes: textBytes("hello"),
        mime: "text/plain",
        encoding: "utf-8",
        metadata: { role: "example" }
      }
    ],
    metadata: { profile: "test" }
  });
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
