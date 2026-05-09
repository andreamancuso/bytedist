import path from "node:path";

import { createPayload } from "../dist/index.js";
import { resetOutputDir, tinyPngBytes, writeFile, logSuccess } from "./shared.mjs";

const textEncoder = new TextEncoder();

const outputDir = await resetOutputDir("browser-gallery");
const payloadPath = path.join(outputDir, "gallery.bytedist");
const htmlPath = path.join(outputDir, "index.html");

const images = [
  { id: "c/2a4f9c10", title: "Red sample", color: "#d94f45" },
  { id: "c/7b1e83ad", title: "Green sample", color: "#3fa66b" },
  { id: "c/b6c54021", title: "Blue sample", color: "#3973d4" }
];

const payload = await createPayload({
  manifest: {
    title: "ByteDist Browser Gallery",
    images: images.map(({ id, title }) => ({ id, title }))
  },
  files: images.map((image) => ({
    name: image.id,
    bytes: tinyPngBytes(image.color),
    mime: "image/svg+xml"
  })),
  integrity: "sha256"
});

await writeFile(payloadPath, payload);
await writeFile(htmlPath, galleryHtml());

logSuccess("Browser gallery example complete", [
  `payload: ${path.relative(process.cwd(), payloadPath)}`,
  `html: ${path.relative(process.cwd(), htmlPath)}`,
  "open index.html from disk and select gallery.bytedist"
]);

function galleryHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ByteDist Browser Gallery</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; }
      ul { display: flex; flex-wrap: wrap; gap: 1rem; padding: 0; }
      li { list-style: none; }
      img { width: 96px; height: 96px; border: 1px solid #999; }
    </style>
  </head>
  <body>
    <h1>ByteDist browser gallery</h1>
    <input id="file" type="file" accept=".bytedist,application/octet-stream" />
    <p id="status">Choose gallery.bytedist.</p>
    <ul id="gallery"></ul>
    <script>
      const textDecoder = new TextDecoder();
      const activeUrls = [];
      const fileInput = document.querySelector("#file");
      const status = document.querySelector("#status");
      const gallery = document.querySelector("#gallery");

      fileInput.addEventListener("change", async () => {
        for (const resource of activeUrls.splice(0)) {
          resource.revoke();
        }
        gallery.textContent = "";

        const file = fileInput.files?.[0];
        if (!file) return;

        try {
          const archive = openPayload(new Uint8Array(await file.arrayBuffer()));
          const manifest = JSON.parse(readText(archive, "manifest.json"));

          for (const image of manifest.images) {
            const bytes = readBytes(archive, image.id);
            const type = archive.chunks.get(image.id)?.mime ?? "application/octet-stream";
            const resource = createObjectUrl(bytes, type);
            activeUrls.push(resource);
            const item = document.createElement("li");
            const img = document.createElement("img");
            const caption = document.createElement("p");
            img.src = resource.url;
            img.alt = image.title;
            caption.textContent = image.title;
            item.append(img, caption);
            gallery.append(item);
          }

          status.textContent = "Loaded from ByteDist payload.";
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : String(error);
        }
      });

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

      function createObjectUrl(bytes, type) {
        const url = URL.createObjectURL(new Blob([bytes], { type }));
        return { url, revoke: () => URL.revokeObjectURL(url) };
      }

      function assertAscii(bytes, expected, message) {
        if (textDecoder.decode(bytes) !== expected) throw new Error(message);
      }
    </script>
  </body>
</html>
`;
}
