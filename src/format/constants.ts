export const PAYLOAD_MAGIC_TEXT = "BDISTPAY";

export const PAYLOAD_MAGIC_BYTES = new Uint8Array([0x42, 0x44, 0x49, 0x53, 0x54, 0x50, 0x41, 0x59]);

export const PAYLOAD_MAGIC_LENGTH = PAYLOAD_MAGIC_BYTES.length;

export const FOOTER_MAGIC_TEXT = "BDISTEND";

export const FOOTER_MAGIC_BYTES = new Uint8Array([0x42, 0x44, 0x49, 0x53, 0x54, 0x45, 0x4e, 0x44]);

export const FOOTER_MAGIC_LENGTH = FOOTER_MAGIC_BYTES.length;

export const PAYLOAD_FORMAT_VERSION = 0;

export const PAYLOAD_HEADER_LENGTH = 24;

export const PAYLOAD_FOOTER_LENGTH = 40;

export const PAYLOAD_FLAGS_NONE = 0;

export const FOOTER_CHECKSUM_NONE = 0;

export const DEFAULT_TOC_ENCODING = "json";

export const DEFAULT_COMPRESSION = "none";

export const DEFAULT_MANIFEST_CHUNK_NAME = "manifest.json";

export const RESERVED_CHUNK_NAMESPACE = ".bytedist";

export const RESERVED_CHUNK_NAMES = [
  ".bytedist/metadata.json",
  ".bytedist/signature",
  ".bytedist/license.json"
] as const;
