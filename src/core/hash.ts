import { PayloadIntegrityError } from "../format/errors.js";
import type { PayloadHash } from "../format/types.js";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;

  if (subtle) {
    const digest = await subtle.digest("SHA-256", toArrayBuffer(bytes));
    return bytesToHex(new Uint8Array(digest));
  }

  return sha256HexWithNodeCrypto(bytes);
}

export async function computePayloadHash(payloadBytes: Uint8Array): Promise<PayloadHash> {
  return {
    algorithm: "sha256",
    value: await sha256Hex(payloadBytes)
  };
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

async function sha256HexWithNodeCrypto(bytes: Uint8Array): Promise<string> {
  try {
    const nodeCryptoSpecifier = "node:crypto";
    const { createHash } = (await import(nodeCryptoSpecifier)) as typeof import("node:crypto");
    return createHash("sha256").update(bytes).digest("hex");
  } catch (error) {
    throw new PayloadIntegrityError("SHA-256 hashing is unavailable in this runtime.", {
      cause: error
    });
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

const CRC32_TABLE = createCrc32Table();

function createCrc32Table(): readonly number[] {
  const table: number[] = [];

  for (let byte = 0; byte < 256; byte += 1) {
    let crc = byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[byte] = crc >>> 0;
  }

  return table;
}
