import fs from "node:fs/promises";
import path from "node:path";

import { createPayload, openPayload } from "../dist/index.js";
import { embedPayloadInHtml } from "../dist/html/index.js";
import { repoRoot, resetOutputDir, writeFile, logSuccess } from "./shared.mjs";

const textEncoder = new TextEncoder();

const fixtureRoot = path.join(repoRoot, "examples", "open-museum-pack");
const outputDir = await resetOutputDir("open-museum-pack");
const payloadPath = path.join(outputDir, "museum.bytedist");
const htmlPath = path.join(outputDir, "index.html");

const artworks = JSON.parse(await fs.readFile(path.join(fixtureRoot, "artworks.json"), "utf8"));
const files = [];

for (const artwork of artworks) {
  files.push({
    name: artwork.imageChunk,
    bytes: await fs.readFile(path.join(fixtureRoot, "fixtures", artwork.imageFile)),
    mime: "image/jpeg",
    metadata: {
      title: artwork.title,
      sourceUrl: artwork.sourceUrl,
      rights: artwork.rights
    }
  });
}

const manifest = {
  title: "Open Museum Pack",
  description: "A small deterministic museum fixture packaged with ByteDist.",
  source: {
    institution: "Art Institute of Chicago",
    api: "https://api.artic.edu/docs/"
  },
  artworks: artworks.map((artwork) => ({
    id: artwork.id,
    title: artwork.title,
    artist: artwork.artist,
    date: artwork.date,
    image: artwork.imageChunk,
    width: artwork.imageWidth,
    height: artwork.imageHeight,
    sourceUrl: artwork.sourceUrl,
    apiUrl: artwork.apiUrl,
    rights: artwork.rights
  }))
};

const payload = await createPayload({
  manifest,
  files,
  chunkOrder: "name",
  integrity: "sha256",
  metadata: {
    title: "Open Museum Pack",
    description: "Public-domain museum fixture for ByteDist examples.",
    createdBy: "bytedist examples",
    appId: "bytedist.example.open-museum-pack",
    appVersion: "1.0.0"
  }
});

await writeFile(payloadPath, payload);
await writeFile(htmlPath, embedPayloadInHtml(templateHtml(), payload));

const archive = await openPayload(payload);
await archive.verify();

const loadedManifest = await archive.readJson("manifest.json");
const toc = archive.getToc();
const imageBytes = await Promise.all(
  loadedManifest.artworks.map((artwork) => archive.readBytes(artwork.image))
);

logSuccess("Open museum pack example complete", [
  `payload: ${path.relative(process.cwd(), payloadPath)}`,
  `html: ${path.relative(process.cwd(), htmlPath)}`,
  `artworks: ${loadedManifest.artworks.length}`,
  `chunks: ${archive.list().join(", ")}`,
  `image bytes: ${imageBytes.map((bytes) => bytes.byteLength).join(", ")}`,
  `verified hashes: ${toc.chunks.every((chunk) => chunk.hash?.algorithm === "sha256")}`,
  "open index.html from disk"
]);

function templateHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Open Museum Pack</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #181818;
        background: #f4f1ec;
      }

      body {
        margin: 0;
      }

      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 40px 24px 56px;
      }

      header {
        display: grid;
        gap: 10px;
        margin-bottom: 28px;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 4.25rem);
        line-height: 1;
        font-weight: 760;
      }

      p {
        margin: 0;
      }

      .summary {
        max-width: 720px;
        font-size: 1.05rem;
        line-height: 1.55;
        color: #3f3d38;
      }

      .status {
        display: inline-flex;
        width: fit-content;
        border: 1px solid #c8beb0;
        padding: 6px 10px;
        border-radius: 999px;
        background: #fffaf2;
        font-size: .88rem;
        color: #4b463e;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 22px;
      }

      article {
        display: grid;
        gap: 14px;
        background: #fffdf8;
        border: 1px solid #d8d0c4;
        border-radius: 8px;
        padding: 14px;
      }

      img {
        display: block;
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: contain;
        background: #e7dfd2;
      }

      h2 {
        margin: 0;
        font-size: 1.12rem;
        line-height: 1.25;
      }

      .meta {
        display: grid;
        gap: 4px;
        color: #5f5a51;
        font-size: .94rem;
      }

      a {
        color: #8d351d;
      }

      code {
        font-size: .86em;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Open Museum Pack</h1>
        <p class="summary">
          A deterministic public-domain museum fixture packaged as a ByteDist payload and opened from a single HTML file.
        </p>
        <p id="status" class="status">Loading embedded payload...</p>
      </header>
      <section id="gallery" class="grid" aria-label="Artwork gallery"></section>
    </main>
    <!-- BYTEDIST_PAYLOAD -->
    <script>
      const PAYLOAD_SELECTOR =
        'script[type="application/octet-stream+base64"][data-bytedist-payload]';
      const textDecoder = new TextDecoder();
      const activeUrls = [];

      try {
        const archive = openPayload(readEmbeddedPayload());
        const manifest = JSON.parse(readText(archive, "manifest.json"));
        const gallery = document.querySelector("#gallery");

        document.title = manifest.title;
        document.querySelector("#status").textContent =
          "Loaded " + manifest.artworks.length + " artworks from embedded ByteDist payload.";

        for (const artwork of manifest.artworks) {
          const bytes = readBytes(archive, artwork.image);
          const type = archive.chunks.get(artwork.image)?.mime ?? "application/octet-stream";
          const url = URL.createObjectURL(new Blob([bytes], { type }));
          activeUrls.push(url);
          gallery.append(renderArtwork(artwork, url));
        }
      } catch (error) {
        document.querySelector("#status").textContent =
          error instanceof Error ? error.message : String(error);
      }

      window.addEventListener(
        "pagehide",
        () => {
          for (const url of activeUrls) URL.revokeObjectURL(url);
        },
        { once: true }
      );

      function renderArtwork(artwork, imageUrl) {
        const item = document.createElement("article");
        const image = document.createElement("img");
        const title = document.createElement("h2");
        const meta = document.createElement("p");
        const rights = document.createElement("p");
        const source = document.createElement("a");

        image.src = imageUrl;
        image.alt = artwork.title + " by " + artwork.artist;
        image.width = artwork.width;
        image.height = artwork.height;
        title.textContent = artwork.title;
        meta.className = "meta";
        meta.textContent = artwork.artist + ", " + artwork.date;
        rights.className = "meta";
        rights.textContent = artwork.rights + " · chunk " + artwork.image;
        source.href = artwork.sourceUrl;
        source.textContent = "Source record";

        item.append(image, title, meta, rights, source);
        return item;
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
  </body>
</html>
`;
}
