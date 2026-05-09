import path from "node:path";

import { createPayload, openPayload } from "../dist/index.js";
import { resetOutputDir, writeFile, logSuccess } from "./shared.mjs";

const textEncoder = new TextEncoder();

const outputDir = await resetOutputDir("basic");
const payloadPath = path.join(outputDir, "basic.bytedist");

const payload = await createPayload({
  manifest: {
    title: "Basic ByteDist example",
    entry: "c/message"
  },
  files: [
    {
      name: "c/message",
      bytes: textEncoder.encode("Hello from ByteDist."),
      mime: "text/plain",
      encoding: "utf-8"
    },
    {
      name: "c/data",
      bytes: textEncoder.encode(JSON.stringify({ kind: "basic", ok: true })),
      mime: "application/json",
      encoding: "utf-8"
    }
  ],
  integrity: "sha256"
});

await writeFile(payloadPath, payload);

const archive = await openPayload(payload);
await archive.verify();

const manifest = await archive.readJson("manifest.json");
const message = await archive.readText(manifest.entry);
const data = await archive.readJson("c/data");

logSuccess("Basic Node example complete", [
  `wrote ${path.relative(process.cwd(), payloadPath)}`,
  `chunks: ${archive.list().join(", ")}`,
  `message: ${message}`,
  `data ok: ${data.ok}`
]);
