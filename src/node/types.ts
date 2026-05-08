import type {
  CompressionAlgorithm,
  CompressionCodec,
  CompressionMode,
  IntegrityAlgorithm,
  JsonObject
} from "../format/types.js";

export interface CollectDirectoryFilesOptions {
  readonly ignore?: readonly string[];
}

export interface PackDirectoryOptions extends CollectDirectoryFilesOptions {
  readonly manifestPath?: string;
  readonly integrity?: IntegrityAlgorithm | false;
  readonly compression?: CompressionAlgorithm;
  readonly compressionMode?: CompressionMode;
  readonly compressionCodecs?: readonly CompressionCodec[];
  readonly createdBy?: string;
  readonly metadata?: JsonObject;
}

export interface WritePayloadFileOptions {
  readonly overwrite?: boolean;
}
