import type {
  DEFAULT_COMPRESSION,
  DEFAULT_TOC_ENCODING,
  PAYLOAD_FORMAT_VERSION
} from "./constants.js";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonArray = readonly JsonValue[];

export type TocEncoding = typeof DEFAULT_TOC_ENCODING;

export type IntegrityAlgorithm = "sha256";

export type CompressionAlgorithm = typeof DEFAULT_COMPRESSION | (string & {});

export type CompressionMode = "smaller" | "always";

export interface CompressionCodec {
  readonly name: CompressionAlgorithm;
  compress(bytes: Uint8Array): Promise<Uint8Array>;
  decompress(bytes: Uint8Array): Promise<Uint8Array>;
}

export interface PayloadHash {
  readonly algorithm: IntegrityAlgorithm;
  readonly value: string;
}

export interface PayloadFileInput {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly mime?: string;
  readonly encoding?: string;
  readonly compression?: CompressionAlgorithm;
  readonly compressionMode?: CompressionMode;
  readonly metadata?: JsonObject;
}

export interface CreatePayloadOptions {
  readonly manifest?: JsonValue;
  readonly files: readonly PayloadFileInput[];
  readonly integrity?: IntegrityAlgorithm | false;
  readonly compression?: CompressionAlgorithm;
  readonly compressionMode?: CompressionMode;
  readonly compressionCodecs?: readonly CompressionCodec[];
  readonly createdBy?: string;
  readonly metadata?: JsonObject;
}

export interface OpenPayloadOptions {
  readonly compressionCodecs?: readonly CompressionCodec[];
}

export interface PayloadManifestReference {
  readonly path: string;
}

export interface PayloadChunkRecord {
  readonly name: string;
  readonly offset: number;
  readonly length: number;
  readonly storedLength: number;
  readonly mime?: string;
  readonly encoding?: string;
  readonly compression: CompressionAlgorithm;
  readonly hash?: PayloadHash;
  readonly metadata?: JsonObject;
}

export interface PayloadToc {
  readonly version: typeof PAYLOAD_FORMAT_VERSION;
  readonly tocEncoding: TocEncoding;
  readonly createdBy?: string;
  readonly manifest?: PayloadManifestReference;
  readonly chunks: readonly PayloadChunkRecord[];
  readonly metadata?: JsonObject;
}

export interface OpenedPayload {
  readonly formatVersion: typeof PAYLOAD_FORMAT_VERSION;
  getToc(): PayloadToc;
  list(): readonly string[];
  has(name: string): boolean;
  readBytes(name: string): Promise<Uint8Array>;
  readText(name: string): Promise<string>;
  readJson<T extends JsonValue = JsonValue>(name: string): Promise<T>;
  verify(): Promise<void>;
  close(): void;
}
