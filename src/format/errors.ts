export interface ByteDistErrorOptions {
  readonly cause?: unknown;
}

export class ByteDistError extends Error {
  public constructor(message: string, options?: ByteDistErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PayloadFormatError extends ByteDistError {}

export class PayloadVersionError extends ByteDistError {
  public readonly version: number;

  public constructor(version: number, message?: string, options?: ByteDistErrorOptions) {
    super(message ?? `Unsupported ByteDist payload format version: ${version}.`, options);
    this.version = version;
  }
}

export class PayloadIntegrityError extends ByteDistError {}

export class PayloadChunkNotFoundError extends ByteDistError {
  public readonly chunkName: string;

  public constructor(chunkName: string, message?: string, options?: ByteDistErrorOptions) {
    super(message ?? `ByteDist payload chunk not found: ${chunkName}.`, options);
    this.chunkName = chunkName;
  }
}

export class PayloadCompressionError extends ByteDistError {}

export class PayloadEmbeddingError extends ByteDistError {}

export class PayloadUnsupportedFeatureError extends ByteDistError {}
