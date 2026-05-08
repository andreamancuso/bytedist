export const PAYLOAD_MAGIC_TEXT = "BDISTPAY";

export const PAYLOAD_MAGIC_BYTES = new Uint8Array([0x42, 0x44, 0x49, 0x53, 0x54, 0x50, 0x41, 0x59]);

export const PAYLOAD_MAGIC_LENGTH = PAYLOAD_MAGIC_BYTES.length;

export const FOOTER_MAGIC_TEXT = "BDISTEND";

export const FOOTER_MAGIC_BYTES = new Uint8Array([0x42, 0x44, 0x49, 0x53, 0x54, 0x45, 0x4e, 0x44]);

export const FOOTER_MAGIC_LENGTH = FOOTER_MAGIC_BYTES.length;

export const PAYLOAD_FORMAT_VERSION = 0;

export const DEFAULT_TOC_ENCODING = "json";

export const DEFAULT_COMPRESSION = "none";
