import type {
  CompressionAlgorithm,
  CompressionCodec,
  CompressionMode,
  IntegrityAlgorithm,
  PayloadMetadata
} from "../format/types.js";

export interface CollectDirectoryFilesOptions {
  readonly ignore?: readonly string[];
  readonly allowReservedChunkNames?: boolean;
}

export interface PackDirectoryOptions extends CollectDirectoryFilesOptions {
  readonly manifestPath?: string;
  readonly integrity?: IntegrityAlgorithm | false;
  readonly compression?: CompressionAlgorithm;
  readonly compressionMode?: CompressionMode;
  readonly compressionCodecs?: readonly CompressionCodec[];
  readonly createdBy?: string;
  readonly metadata?: PayloadMetadata;
}

export interface WritePayloadFileOptions {
  readonly overwrite?: boolean;
}
