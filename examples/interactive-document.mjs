import path from "node:path";

import { createPayload, openPayload } from "../dist/index.js";
import { resetOutputDir, tinyPngBytes, writeFile, logSuccess } from "./shared.mjs";

const textEncoder = new TextEncoder();

const outputDir = await resetOutputDir("interactive-document");
const payloadPath = path.join(outputDir, "document.bytedist");

const payload = await createPayload({
  manifest: {
    title: "Interactive Document Example",
    scene: "c/scene",
    body: "c/body",
    image: "c/image",
    binary: "c/binary"
  },
  files: [
    {
      name: "c/scene",
      bytes: textEncoder.encode(JSON.stringify({ nodes: 3, theme: "generic" })),
      mime: "application/json",
      encoding: "utf-8"
    },
    {
      name: "c/body",
      bytes: textEncoder.encode("This document mixes JSON, text, image, and binary chunks."),
      mime: "text/plain",
      encoding: "utf-8"
    },
    {
      name: "c/image",
      bytes: tinyPngBytes("#ffb000"),
      mime: "image/svg+xml"
    },
    {
      name: "c/binary",
      bytes: new Uint8Array([0, 1, 1, 2, 3, 5, 8, 13]),
      mime: "application/octet-stream"
    }
  ],
  integrity: "sha256"
});

await writeFile(payloadPath, payload);

const archive = await openPayload(payload);
await archive.verify();

const manifest = await archive.readJson("manifest.json");
const scene = await archive.readJson(manifest.scene);
const body = await archive.readText(manifest.body);
const binary = await archive.readBytes(manifest.binary);

logSuccess("Interactive document example complete", [
  `payload: ${path.relative(process.cwd(), payloadPath)}`,
  `scene nodes: ${scene.nodes}`,
  `body: ${body}`,
  `binary bytes: ${Array.from(binary).join(",")}`
]);
