import { DEFAULT_COMPRESSION } from "../format/constants.js";
import { PayloadCompressionError } from "../format/errors.js";
import type { CompressionAlgorithm, CompressionCodec } from "../format/types.js";

const CODEC_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

export function validateCompressionName(name: unknown): asserts name is CompressionAlgorithm {
  if (typeof name !== "string" || !CODEC_NAME_PATTERN.test(name)) {
    throw new PayloadCompressionError(`Invalid ByteDist compression codec name: ${String(name)}.`);
  }
}

export function getCompressionCodec(
  name: CompressionAlgorithm,
  codecs: readonly CompressionCodec[] | undefined
): CompressionCodec {
  validateCompressionName(name);

  if (name === DEFAULT_COMPRESSION) {
    return NONE_CODEC;
  }

  const codec = codecs?.find((candidate) => candidate.name === name);
  if (codec === undefined) {
    throw new PayloadCompressionError(`Missing ByteDist compression codec: ${name}.`);
  }

  validateCustomCodec(codec);
  return codec;
}

export function validateCompressionCodecs(codecs: readonly CompressionCodec[] | undefined): void {
  const names = new Set<string>();

  for (const codec of codecs ?? []) {
    validateCustomCodec(codec);

    if (names.has(codec.name)) {
      throw new PayloadCompressionError(`Duplicate ByteDist compression codec: ${codec.name}.`);
    }

    names.add(codec.name);
  }
}

function validateCustomCodec(codec: CompressionCodec): void {
  validateCompressionName(codec.name);

  if (codec.name === DEFAULT_COMPRESSION) {
    throw new PayloadCompressionError("Compression codec name is reserved: none.");
  }
}

const NONE_CODEC: CompressionCodec = {
  name: DEFAULT_COMPRESSION,
  async compress(bytes: Uint8Array): Promise<Uint8Array> {
    return bytes;
  },
  async decompress(bytes: Uint8Array): Promise<Uint8Array> {
    return bytes;
  }
};
