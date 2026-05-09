import {
  DEFAULT_TOC_ENCODING,
  PAYLOAD_FOOTER_LENGTH,
  PAYLOAD_FORMAT_VERSION
} from "../format/constants.js";
import { PayloadFormatError, PayloadSignatureError } from "../format/errors.js";
import { assertFooterMagic, assertSupportedFormatVersion } from "../format/validation.js";
import type {
  CompressionCodec,
  JsonObject,
  PayloadChunkRecord,
  PayloadManifestReference,
  PayloadMetadata
} from "../format/types.js";
import { crc32, sha256Hex } from "./hash.js";
import { openPayload } from "./read.js";

export const SIGNATURE_ENVELOPE_FORMAT = "bytedist-signature";
export const SIGNATURE_ENVELOPE_VERSION = 1;
export const SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256";

export interface PayloadSigningOptions {
  readonly compressionCodecs?: readonly CompressionCodec[];
}

export interface PayloadSignatureVerificationOptions {
  readonly compressionCodecs?: readonly CompressionCodec[];
}

export interface PayloadSignatureTocProvenance {
  readonly encoding: typeof DEFAULT_TOC_ENCODING;
  readonly offset: number;
  readonly length: number;
  readonly crc32: number;
  readonly sha256: string;
}

export interface PayloadSignatureChunkProvenance {
  readonly name: string;
  readonly offset: number;
  readonly length: number;
  readonly storedLength: number;
  readonly compression: string;
  readonly sha256: string;
  readonly mime?: string;
  readonly encoding?: string;
  readonly metadata?: JsonObject;
}

export interface PayloadSignatureProvenance {
  readonly payloadFormatVersion: typeof PAYLOAD_FORMAT_VERSION;
  readonly payloadLength: number;
  readonly toc: PayloadSignatureTocProvenance;
  readonly createdBy?: string;
  readonly manifest?: PayloadManifestReference;
  readonly metadata?: PayloadMetadata;
  readonly chunks: readonly PayloadSignatureChunkProvenance[];
}

export interface PayloadSignatureEnvelope {
  readonly format: typeof SIGNATURE_ENVELOPE_FORMAT;
  readonly version: typeof SIGNATURE_ENVELOPE_VERSION;
  readonly algorithm: typeof SIGNATURE_ALGORITHM;
  readonly provenance: PayloadSignatureProvenance;
  readonly signature: string;
}

interface FooterFields {
  readonly formatVersion: typeof PAYLOAD_FORMAT_VERSION;
  readonly tocOffset: number;
  readonly tocLength: number;
  readonly payloadLength: number;
  readonly tocChecksum: number;
}

const textEncoder = new TextEncoder();

export async function signPayload(
  payloadBytes: Uint8Array,
  privateKeyPem: string,
  options: PayloadSigningOptions = {}
): Promise<PayloadSignatureEnvelope> {
  const provenance = await createPayloadSignatureProvenance(payloadBytes, options);
  const privateKey = await importPrivateKey(privateKeyPem);
  const signatureBytes = await getSubtleCrypto().sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    bytesToArrayBuffer(canonicalBytes(provenance))
  );

  return {
    format: SIGNATURE_ENVELOPE_FORMAT,
    version: SIGNATURE_ENVELOPE_VERSION,
    algorithm: SIGNATURE_ALGORITHM,
    provenance,
    signature: bytesToBase64Url(new Uint8Array(signatureBytes))
  };
}

export async function verifyPayloadSignature(
  payloadBytes: Uint8Array,
  envelope: PayloadSignatureEnvelope,
  publicKeyPem: string,
  options: PayloadSignatureVerificationOptions = {}
): Promise<void> {
  const signatureEnvelope = coerceSignatureEnvelope(envelope);
  const publicKey = await importPublicKey(publicKeyPem);
  const signatureIsValid = await getSubtleCrypto().verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    bytesToArrayBuffer(base64UrlToBytes(signatureEnvelope.signature)),
    bytesToArrayBuffer(canonicalBytes(signatureEnvelope.provenance))
  );

  if (!signatureIsValid) {
    throw new PayloadSignatureError("ByteDist payload signature is invalid.");
  }

  const currentProvenance = await createPayloadSignatureProvenance(payloadBytes, options);
  if (canonicalJson(currentProvenance) !== canonicalJson(signatureEnvelope.provenance)) {
    throw new PayloadSignatureError(
      "ByteDist payload signature provenance does not match the payload."
    );
  }
}

export async function createPayloadSignatureProvenance(
  payloadBytes: Uint8Array,
  options: PayloadSigningOptions = {}
): Promise<PayloadSignatureProvenance> {
  const archive = await openPayload(
    payloadBytes,
    options.compressionCodecs === undefined
      ? {}
      : {
          compressionCodecs: options.compressionCodecs
        }
  );
  await archive.verify();

  const toc = archive.getToc();
  const footer = readFooter(payloadBytes);
  const tocBytes = payloadBytes.slice(footer.tocOffset, footer.tocOffset + footer.tocLength);

  if (footer.tocChecksum !== crc32(tocBytes)) {
    throw new PayloadFormatError("ByteDist TOC CRC32 changed while building provenance.");
  }

  return {
    payloadFormatVersion: footer.formatVersion,
    payloadLength: footer.payloadLength,
    toc: {
      encoding: toc.tocEncoding,
      offset: footer.tocOffset,
      length: footer.tocLength,
      crc32: footer.tocChecksum,
      sha256: await sha256Hex(tocBytes)
    },
    ...(toc.createdBy === undefined ? {} : { createdBy: toc.createdBy }),
    ...(toc.manifest === undefined ? {} : { manifest: toc.manifest }),
    ...(toc.metadata === undefined ? {} : { metadata: toc.metadata }),
    chunks: toc.chunks.map(toChunkProvenance)
  };
}

export function stringifySignatureEnvelope(envelope: PayloadSignatureEnvelope): string {
  return `${canonicalJson(coerceSignatureEnvelope(envelope))}\n`;
}

export function parseSignatureEnvelope(json: string): PayloadSignatureEnvelope {
  try {
    return coerceSignatureEnvelope(JSON.parse(json));
  } catch (error) {
    if (error instanceof PayloadSignatureError) {
      throw error;
    }

    throw new PayloadSignatureError("ByteDist signature envelope is not valid JSON.", {
      cause: error
    });
  }
}

function toChunkProvenance(chunk: PayloadChunkRecord): PayloadSignatureChunkProvenance {
  if (chunk.hash?.algorithm !== "sha256") {
    throw new PayloadSignatureError(
      `ByteDist chunk ${chunk.name} has no SHA-256 integrity metadata.`
    );
  }

  return {
    name: chunk.name,
    offset: chunk.offset,
    length: chunk.length,
    storedLength: chunk.storedLength,
    compression: chunk.compression,
    sha256: chunk.hash.value,
    ...(chunk.mime === undefined ? {} : { mime: chunk.mime }),
    ...(chunk.encoding === undefined ? {} : { encoding: chunk.encoding }),
    ...(chunk.metadata === undefined ? {} : { metadata: chunk.metadata })
  };
}

function readFooter(bytes: Uint8Array): FooterFields {
  if (bytes.byteLength < PAYLOAD_FOOTER_LENGTH) {
    throw new PayloadFormatError("ByteDist payload is too short to contain a footer.");
  }

  const footerOffset = bytes.byteLength - PAYLOAD_FOOTER_LENGTH;
  assertFooterMagic(bytes.slice(footerOffset, footerOffset + 8));

  const view = new DataView(bytes.buffer, bytes.byteOffset + footerOffset, PAYLOAD_FOOTER_LENGTH);
  const version = view.getUint32(8, true);
  assertSupportedFormatVersion(version);

  return {
    formatVersion: PAYLOAD_FORMAT_VERSION,
    tocOffset: readU64(view, 12, "TOC offset"),
    tocLength: readU64(view, 20, "TOC length"),
    payloadLength: readU64(view, 28, "payload length"),
    tocChecksum: view.getUint32(36, true)
  };
}

function readU64(view: DataView, byteOffset: number, label: string): number {
  const value = Number(view.getBigUint64(byteOffset, true));
  if (!Number.isSafeInteger(value)) {
    throw new PayloadFormatError(`ByteDist ${label} is outside the safe integer range.`);
  }

  return value;
}

function canonicalBytes(value: unknown): Uint8Array {
  return textEncoder.encode(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const property = record[key];
    if (property !== undefined) {
      output[key] = canonicalize(property);
    }
  }

  return output;
}

function coerceSignatureEnvelope(value: unknown): PayloadSignatureEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PayloadSignatureError("ByteDist signature envelope must be an object.");
  }

  const envelope = value as Partial<PayloadSignatureEnvelope>;
  if (envelope.format !== SIGNATURE_ENVELOPE_FORMAT) {
    throw new PayloadSignatureError("ByteDist signature envelope has an unsupported format.");
  }

  if (envelope.version !== SIGNATURE_ENVELOPE_VERSION) {
    throw new PayloadSignatureError("ByteDist signature envelope has an unsupported version.");
  }

  if (envelope.algorithm !== SIGNATURE_ALGORITHM) {
    throw new PayloadSignatureError("ByteDist signature envelope has an unsupported algorithm.");
  }

  if (typeof envelope.signature !== "string" || envelope.signature.length === 0) {
    throw new PayloadSignatureError("ByteDist signature envelope is missing a signature.");
  }

  if (
    typeof envelope.provenance !== "object" ||
    envelope.provenance === null ||
    Array.isArray(envelope.provenance)
  ) {
    throw new PayloadSignatureError("ByteDist signature envelope is missing provenance.");
  }

  return envelope as PayloadSignatureEnvelope;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  try {
    return await getSubtleCrypto().importKey(
      "pkcs8",
      pemToDer(pem, "PRIVATE KEY"),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  } catch (error) {
    throw new PayloadSignatureError(
      "ByteDist private signing key must be a PKCS#8 P-256 PEM key.",
      { cause: error }
    );
  }
}

async function importPublicKey(pem: string): Promise<CryptoKey> {
  try {
    return await getSubtleCrypto().importKey(
      "spki",
      pemToDer(pem, "PUBLIC KEY"),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch (error) {
    throw new PayloadSignatureError(
      "ByteDist public verification key must be an SPKI P-256 PEM key.",
      { cause: error }
    );
  }
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new PayloadSignatureError("WebCrypto signing support is unavailable in this runtime.");
  }

  return subtle;
}

function pemToDer(pem: string, label: string): ArrayBuffer {
  const begin = `-----BEGIN ${label}-----`;
  const end = `-----END ${label}-----`;
  if (!pem.includes(begin) || !pem.includes(end)) {
    throw new PayloadSignatureError(`Expected PEM block ${begin}.`);
  }

  const base64 = pem.replace(begin, "").replace(end, "").replace(/\s+/g, "");
  return bytesToArrayBuffer(base64ToBytes(base64));
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa(String.fromCharCode(...bytes))
      : Buffer.from(bytes).toString("base64");

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
