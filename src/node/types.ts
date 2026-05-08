import type { CompressionAlgorithm, IntegrityAlgorithm, JsonObject } from "../format/types.js";

export interface CollectDirectoryFilesOptions {
  readonly ignore?: readonly string[];
}

export interface PackDirectoryOptions extends CollectDirectoryFilesOptions {
  readonly manifestPath?: string;
  readonly integrity?: IntegrityAlgorithm | false;
  readonly compression?: CompressionAlgorithm;
  readonly createdBy?: string;
  readonly metadata?: JsonObject;
}

export interface WritePayloadFileOptions {
  readonly overwrite?: boolean;
}
