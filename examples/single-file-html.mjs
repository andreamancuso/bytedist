import path from "node:path";

import { createPayload } from "../dist/index.js";
import { embedPayloadInHtml } from "../dist/html/index.js";
import { resetOutputDir, tinyPngBytes, writeFile, logSuccess } from "./shared.mjs";

const textEncoder = new TextEncoder();

const outputDir = await resetOutputDir("single-file-html");
const outputPath = path.join(outputDir, "standalone.html");

const payload = await createPayload({
  manifest: {
    title: "ByteDist Single File Example",
    message: "c/message",
    image: "c/preview"
  },
  files: [
    {
      name: "c/message",
      bytes: textEncoder.encode("Rendered from an embedded ByteDist payload."),
      mime: "text/plain",
      encoding: "utf-8"
    },
    {
      name: "c/preview",
      bytes: tinyPngBytes("#6a5acd"),
      mime: "image/svg+xml"
    }
  ],
  integrity: "sha256"
});

const html = embedPayloadInHtml(templateHtml(), payload);
await writeFile(outputPath, html);

logSuccess("Single-file HTML example complete", [
  `html: ${path.relative(process.cwd(), outputPath)}`,
  "open standalone.html from disk"
]);

function templateHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ByteDist Single File Example</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; }
      img { width: 96px; height: 96px; border: 1px solid #999; }
    </style>
  </head>
  <body>
    <h1>ByteDist single-file HTML</h1>
    <p id="message">Loading...</p>
    <img id="image" alt="Embedded ByteDist resource" />
    <script>
      const PAYLOAD_SELECTOR =
        'script[type="application/octet-stream+base64"][data-bytedist-payload]';
      const textDecoder = new TextDecoder();

      try {
        const archive = openPayload(readEmbeddedPayload());
        const manifest = JSON.parse(readText(archive, "manifest.json"));
        const imageBytes = readBytes(archive, manifest.image);
        const imageType = archive.chunks.get(manifest.image)?.mime ?? "application/octet-stream";
        const imageUrl = URL.createObjectURL(new Blob([imageBytes], { type: imageType }));
        document.title = manifest.title;
        document.querySelector("#message").textContent = readText(archive, manifest.message);
        document.querySelector("#image").src = imageUrl;
        window.addEventListener("pagehide", () => URL.revokeObjectURL(imageUrl), { once: true });
      } catch (error) {
        document.querySelector("#message").textContent =
          error instanceof Error ? error.message : String(error);
      }

      function readEmbeddedPayload() {
        const element = document.querySelector(PAYLOAD_SELECTOR);
        if (!element) throw new Error("Embedded ByteDist payload was not found.");
        return decodeBase64(element.textContent ?? "");
      }

      function openPayload(bytes) {
        assertAscii(bytes.subarray(0, 8), "BDISTPAY", "Invalid ByteDist payload.");
        const footerOffset = bytes.byteLength - 40;
        assertAscii(bytes.subarray(footerOffset, footerOffset + 8), "BDISTEND", "Invalid footer.");
        const footer = new DataView(bytes.buffer, bytes.byteOffset + footerOffset, 40);
        const tocOffset = Number(footer.getBigUint64(12, true));
        const tocLength = Number(footer.getBigUint64(20, true));
        const toc = JSON.parse(textDecoder.decode(bytes.slice(tocOffset, tocOffset + tocLength)));
        return { bytes, toc, chunks: new Map(toc.chunks.map((chunk) => [chunk.name, chunk])) };
      }

      function readBytes(archive, name) {
        const chunk = archive.chunks.get(name);
        if (!chunk) throw new Error("Missing ByteDist chunk: " + name);
        return archive.bytes.slice(chunk.offset, chunk.offset + chunk.storedLength);
      }

      function readText(archive, name) {
        return textDecoder.decode(readBytes(archive, name));
      }

      function decodeBase64(text) {
        const binary = atob(text.replace(/\\s+/g, ""));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
      }

      function assertAscii(bytes, expected, message) {
        if (textDecoder.decode(bytes) !== expected) throw new Error(message);
      }
    </script>
    <!-- BYTEDIST_PAYLOAD -->
  </body>
</html>
`;
}
