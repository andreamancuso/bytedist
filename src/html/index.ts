import { PayloadEmbeddingError } from "../format/errors.js";

export const EMBEDDED_PAYLOAD_MARKER = "<!-- BYTEDIST_PAYLOAD -->";
export const EMBEDDED_WASM_MARKER = "<!-- BYTEDIST_WASM -->";
export const EMBEDDED_PAYLOAD_SCRIPT_TYPE = "application/octet-stream+base64";
export const EMBEDDED_WASM_SCRIPT_TYPE = "application/wasm+base64";
export const EMBEDDED_PAYLOAD_SELECTOR =
  'script[type="application/octet-stream+base64"][data-bytedist-payload]';
export const EMBEDDED_WASM_SELECTOR = 'script[type="application/wasm+base64"][data-bytedist-wasm]';

export interface EncodeBase64Options {
  readonly lineLength?: number | false;
}

export interface EmbedPayloadInHtmlOptions {
  readonly marker?: string;
  readonly minified?: boolean;
  readonly lineLength?: number;
}

export interface EmbedWasmInHtmlOptions {
  readonly marker?: string;
  readonly minified?: boolean;
  readonly lineLength?: number;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeBase64(bytes: Uint8Array, options: EncodeBase64Options = {}): string {
  let output = "";

  for (let index = 0; index < bytes.byteLength; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const remaining = bytes.byteLength - index;
    const triple = (first << 16) | (second << 8) | third;

    output += BASE64_ALPHABET[(triple >>> 18) & 0x3f];
    output += BASE64_ALPHABET[(triple >>> 12) & 0x3f];
    output += remaining > 1 ? BASE64_ALPHABET[(triple >>> 6) & 0x3f] : "=";
    output += remaining > 2 ? BASE64_ALPHABET[triple & 0x3f] : "=";
  }

  return wrapBase64(output, options.lineLength ?? false);
}

export function decodeBase64(text: string): Uint8Array {
  const normalized = text.replace(/\s+/g, "");

  if (normalized.length === 0) {
    return new Uint8Array();
  }

  if (/[^A-Za-z0-9+/=]/.test(normalized)) {
    throw new PayloadEmbeddingError(
      "Embedded ByteDist payload contains invalid base64 characters."
    );
  }

  const firstPadding = normalized.indexOf("=");
  if (firstPadding !== -1 && !/^=+$/.test(normalized.slice(firstPadding))) {
    throw new PayloadEmbeddingError("Embedded ByteDist payload has invalid base64 padding.");
  }

  if (normalized.length % 4 === 1) {
    throw new PayloadEmbeddingError("Embedded ByteDist payload has invalid base64 length.");
  }

  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const paddingLength = padded.endsWith("==") ? 2 : padded.endsWith("=") ? 1 : 0;

  if (paddingLength > 2 || (paddingLength > 0 && padded.length === paddingLength)) {
    throw new PayloadEmbeddingError("Embedded ByteDist payload has invalid base64 padding.");
  }

  const output = new Uint8Array((padded.length / 4) * 3 - paddingLength);
  let outputOffset = 0;

  for (let index = 0; index < padded.length; index += 4) {
    const a = decodeBase64Char(padded[index] ?? "");
    const b = decodeBase64Char(padded[index + 1] ?? "");
    const c = padded[index + 2] === "=" ? 0 : decodeBase64Char(padded[index + 2] ?? "");
    const d = padded[index + 3] === "=" ? 0 : decodeBase64Char(padded[index + 3] ?? "");
    const triple = (a << 18) | (b << 12) | (c << 6) | d;

    if (outputOffset < output.byteLength) {
      output[outputOffset] = (triple >>> 16) & 0xff;
      outputOffset += 1;
    }

    if (outputOffset < output.byteLength) {
      output[outputOffset] = (triple >>> 8) & 0xff;
      outputOffset += 1;
    }

    if (outputOffset < output.byteLength) {
      output[outputOffset] = triple & 0xff;
      outputOffset += 1;
    }
  }

  return output;
}

export function embedPayloadInHtml(
  templateHtml: string,
  payloadBytes: Uint8Array,
  options: EmbedPayloadInHtmlOptions = {}
): string {
  return embedBytesInHtml(templateHtml, payloadBytes, {
    marker: options.marker ?? EMBEDDED_PAYLOAD_MARKER,
    minified: options.minified,
    lineLength: options.lineLength,
    scriptType: EMBEDDED_PAYLOAD_SCRIPT_TYPE,
    dataAttribute: "data-bytedist-payload",
    label: "payload"
  });
}

export function embedWasmInHtml(
  templateHtml: string,
  wasmBytes: Uint8Array,
  options: EmbedWasmInHtmlOptions = {}
): string {
  return embedBytesInHtml(templateHtml, wasmBytes, {
    marker: options.marker ?? EMBEDDED_WASM_MARKER,
    minified: options.minified,
    lineLength: options.lineLength,
    scriptType: EMBEDDED_WASM_SCRIPT_TYPE,
    dataAttribute: "data-bytedist-wasm",
    label: "WASM"
  });
}

function embedBytesInHtml(
  templateHtml: string,
  bytes: Uint8Array,
  options: {
    readonly marker: string;
    readonly minified: boolean | undefined;
    readonly lineLength: number | undefined;
    readonly scriptType: string;
    readonly dataAttribute: string;
    readonly label: string;
  }
): string {
  const marker = options.marker;

  if (!templateHtml.includes(marker)) {
    throw new PayloadEmbeddingError(
      `HTML template does not contain ByteDist ${options.label} marker: ${marker}`
    );
  }

  const base64 = encodeBase64(bytes, {
    lineLength: options.minified === true ? false : (options.lineLength ?? 76)
  });
  const block =
    options.minified === true
      ? `<script type="${options.scriptType}" ${options.dataAttribute}>${base64}</script>`
      : `<script type="${options.scriptType}" ${options.dataAttribute}>\n${base64}\n</script>`;

  return templateHtml.replace(marker, block);
}

function wrapBase64(text: string, lineLength: number | false): string {
  if (lineLength === false || text.length === 0) {
    return text;
  }

  if (!Number.isSafeInteger(lineLength) || lineLength <= 0) {
    throw new PayloadEmbeddingError("Base64 line length must be a positive safe integer.");
  }

  const lines: string[] = [];
  for (let index = 0; index < text.length; index += lineLength) {
    lines.push(text.slice(index, index + lineLength));
  }

  return lines.join("\n");
}

function decodeBase64Char(char: string): number {
  const value = BASE64_ALPHABET.indexOf(char);

  if (value === -1) {
    throw new PayloadEmbeddingError("Embedded ByteDist payload has invalid base64 padding.");
  }

  return value;
}
