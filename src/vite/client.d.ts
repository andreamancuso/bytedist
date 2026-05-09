declare module "virtual:bytedist/payload" {
  export interface ByteDistViteVirtualChunkMetadata {
    readonly name: string;
    readonly length: number;
    readonly storedLength: number;
    readonly compression: string;
    readonly mime?: string;
    readonly encoding?: string;
    readonly hash?: {
      readonly algorithm: string;
      readonly value: string;
    };
  }

  export interface ByteDistViteVirtualPayloadMetadata {
    readonly outputName: string;
    readonly payloadSize: number;
    readonly emitted: boolean;
    readonly embedded: boolean;
    readonly manifestPath?: string;
    readonly chunkCount: number;
    readonly chunks: readonly ByteDistViteVirtualChunkMetadata[];
  }

  const metadata: ByteDistViteVirtualPayloadMetadata;
  export default metadata;
  export { metadata };
  export const outputName: string;
  export const payloadSize: number;
  export const emitted: boolean;
  export const embedded: boolean;
  export const manifestPath: string | undefined;
  export const chunkCount: number;
  export const chunks: readonly ByteDistViteVirtualChunkMetadata[];
}
