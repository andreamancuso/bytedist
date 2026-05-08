import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";

import { openPayload } from "../core/index.js";
import { PayloadEmbeddingError } from "../format/errors.js";
import {
  EMBEDDED_PAYLOAD_MARKER,
  EMBEDDED_PAYLOAD_SCRIPT_TYPE,
  EMBEDDED_WASM_MARKER,
  EMBEDDED_WASM_SCRIPT_TYPE,
  decodeBase64,
  embedPayloadInHtml,
  embedWasmInHtml,
  encodeBase64
} from "./index.js";

describe("base64 helpers", () => {
  it("round trips binary data", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 252, 253, 254, 255]);

    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  });

  it("encodes and decodes empty bytes", () => {
    expect(encodeBase64(new Uint8Array())).toBe("");
    expect(decodeBase64("")).toEqual(new Uint8Array());
  });

  it("decodes whitespace and newlines", () => {
    expect(decodeBase64(" AAE C\nA/w= \t")).toEqual(new Uint8Array([0, 1, 2, 3, 252]));
  });

  it("round trips larger byte arrays", () => {
    const bytes = Uint8Array.from({ length: 8192 }, (_, index) => index % 251);

    expect(decodeBase64(encodeBase64(bytes, { lineLength: 76 }))).toEqual(bytes);
  });

  it("throws for invalid base64 characters", () => {
    expect(() => decodeBase64("AA!!")).toThrow(PayloadEmbeddingError);
  });

  it("throws for invalid base64 length", () => {
    expect(() => decodeBase64("A")).toThrow(PayloadEmbeddingError);
  });

  it("throws for invalid base64 padding", () => {
    expect(() => decodeBase64("AA=A")).toThrow(PayloadEmbeddingError);
  });

  it("wraps base64 output when requested", () => {
    expect(encodeBase64(new Uint8Array([0, 1, 2, 3, 4, 5]), { lineLength: 4 })).toBe("AAEC\nAwQF");
  });
});

describe("embedPayloadInHtml", () => {
  it("injects a non-executable payload script at the default marker", () => {
    const html = embedPayloadInHtml(`<main></main>${EMBEDDED_PAYLOAD_MARKER}`, new Uint8Array([1]));

    expect(html).toContain(`type="${EMBEDDED_PAYLOAD_SCRIPT_TYPE}"`);
    expect(html).toContain("data-bytedist-payload");
    expect(html).toContain("AQ==");
    expect(html).not.toContain(EMBEDDED_PAYLOAD_MARKER);
  });

  it("supports custom markers", () => {
    const html = embedPayloadInHtml("<body>[[payload]]</body>", new Uint8Array([1, 2, 3]), {
      marker: "[[payload]]"
    });

    expect(html).toContain("AQID");
  });

  it("fails clearly when the marker is missing", () => {
    expect(() => embedPayloadInHtml("<body></body>", new Uint8Array([1]))).toThrow(
      PayloadEmbeddingError
    );
  });

  it("supports minified output", () => {
    const html = embedPayloadInHtml(EMBEDDED_PAYLOAD_MARKER, new Uint8Array([1, 2, 3]), {
      minified: true
    });

    expect(html).toBe(
      `<script type="${EMBEDDED_PAYLOAD_SCRIPT_TYPE}" data-bytedist-payload>AQID</script>`
    );
  });
});

describe("embedWasmInHtml", () => {
  it("injects a non-executable WASM script at the default marker", () => {
    const html = embedWasmInHtml(`<main></main>${EMBEDDED_WASM_MARKER}`, new Uint8Array([0, 97]));

    expect(html).toContain(`type="${EMBEDDED_WASM_SCRIPT_TYPE}"`);
    expect(html).toContain("data-bytedist-wasm");
    expect(html).toContain("AGE=");
    expect(html).not.toContain(EMBEDDED_WASM_MARKER);
  });

  it("supports custom WASM markers and minified output", () => {
    const html = embedWasmInHtml("[[wasm]]", new Uint8Array([0, 1, 2]), {
      marker: "[[wasm]]",
      minified: true
    });

    expect(html).toBe(
      `<script type="${EMBEDDED_WASM_SCRIPT_TYPE}" data-bytedist-wasm>AAEC</script>`
    );
  });

  it("fails clearly when the WASM marker is missing", () => {
    expect(() => embedWasmInHtml("<body></body>", new Uint8Array([1]))).toThrow(
      PayloadEmbeddingError
    );
  });
});

describe("single-file HTML example", () => {
  it("contains a readable embedded payload without executable media data URLs", async () => {
    const html = await fs.readFile(
      new URL("../../examples/single-file-html/index.html", import.meta.url),
      "utf8"
    );
    const match = html.match(
      /<script type="application\/octet-stream\+base64" data-bytedist-payload>\s*([\s\S]*?)\s*<\/script>/
    );

    expect(match?.[1]).toBeDefined();
    expect(html).not.toContain("data:image/");
    expect(html).not.toContain("preview.png");

    const archive = await openPayload(decodeBase64(match?.[1] ?? ""));
    const manifest = await archive.readJson<{ readonly text: string; readonly image: string }>(
      "manifest.json"
    );

    await expect(archive.readText(manifest.text)).resolves.toContain("embedded ByteDist payload");
    expect(archive.getToc().chunks.find((chunk) => chunk.name === manifest.image)?.mime).toBe(
      "image/png"
    );
  });
});
