import {
  FOOTER_MAGIC_BYTES,
  FOOTER_MAGIC_LENGTH,
  PAYLOAD_FORMAT_VERSION,
  PAYLOAD_MAGIC_BYTES,
  PAYLOAD_MAGIC_LENGTH
} from "./constants.js";
import { PayloadFormatError, PayloadVersionError } from "./errors.js";

function hasExpectedMagic(
  bytes: Uint8Array,
  expected: Uint8Array,
  expectedLength: number
): boolean {
  if (bytes.length < expectedLength) {
    return false;
  }

  for (let index = 0; index < expectedLength; index += 1) {
    if (bytes[index] !== expected[index]) {
      return false;
    }
  }

  return true;
}

export function isPayloadMagic(bytes: Uint8Array): boolean {
  return hasExpectedMagic(bytes, PAYLOAD_MAGIC_BYTES, PAYLOAD_MAGIC_LENGTH);
}

export function assertPayloadMagic(bytes: Uint8Array): void {
  if (!isPayloadMagic(bytes)) {
    throw new PayloadFormatError("Invalid ByteDist payload magic bytes.");
  }
}

export function isFooterMagic(bytes: Uint8Array): boolean {
  return hasExpectedMagic(bytes, FOOTER_MAGIC_BYTES, FOOTER_MAGIC_LENGTH);
}

export function assertFooterMagic(bytes: Uint8Array): void {
  if (!isFooterMagic(bytes)) {
    throw new PayloadFormatError("Invalid ByteDist footer magic bytes.");
  }
}

export function isSupportedFormatVersion(
  version: number
): version is typeof PAYLOAD_FORMAT_VERSION {
  return Number.isInteger(version) && version === PAYLOAD_FORMAT_VERSION;
}

export function assertSupportedFormatVersion(version: number): void {
  if (!isSupportedFormatVersion(version)) {
    throw new PayloadVersionError(version);
  }
}
