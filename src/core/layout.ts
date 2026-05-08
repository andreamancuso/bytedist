import {
  FOOTER_CHECKSUM_NONE,
  FOOTER_MAGIC_BYTES,
  PAYLOAD_FLAGS_NONE,
  PAYLOAD_FOOTER_LENGTH,
  PAYLOAD_FORMAT_VERSION,
  PAYLOAD_HEADER_LENGTH,
  PAYLOAD_MAGIC_BYTES
} from "../format/constants.js";

export interface PayloadFooterFields {
  readonly tocOffset: number;
  readonly tocLength: number;
  readonly payloadLength: number;
}

export function writePayloadHeader(): Uint8Array {
  const header = new Uint8Array(PAYLOAD_HEADER_LENGTH);
  header.set(PAYLOAD_MAGIC_BYTES, 0);

  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  view.setUint32(8, PAYLOAD_FORMAT_VERSION, true);
  view.setUint32(12, PAYLOAD_HEADER_LENGTH, true);
  view.setUint32(16, PAYLOAD_FLAGS_NONE, true);
  view.setUint32(20, 0, true);

  return header;
}

export function writePayloadFooter(fields: PayloadFooterFields): Uint8Array {
  const footer = new Uint8Array(PAYLOAD_FOOTER_LENGTH);
  footer.set(FOOTER_MAGIC_BYTES, 0);

  const view = new DataView(footer.buffer, footer.byteOffset, footer.byteLength);
  view.setUint32(8, PAYLOAD_FORMAT_VERSION, true);
  view.setBigUint64(12, BigInt(fields.tocOffset), true);
  view.setBigUint64(20, BigInt(fields.tocLength), true);
  view.setBigUint64(28, BigInt(fields.payloadLength), true);
  view.setUint32(36, FOOTER_CHECKSUM_NONE, true);

  return footer;
}
