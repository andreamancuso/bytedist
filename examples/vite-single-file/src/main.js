import { openEmbeddedPayload } from "bytedist/browser";
import metadata from "virtual:bytedist/payload";

const status = document.querySelector("[data-status]");
const message = document.querySelector("[data-message]");

void run();

async function run() {
  try {
    const archive = await openEmbeddedPayload();
    await archive.verify();
    const manifest = await archive.readJson("manifest.json");
    const text = await archive.readText(manifest.entry);

    if (status) {
      status.textContent = `Loaded ${metadata.chunkCount} chunks from an embedded ByteDist payload.`;
    }

    if (message) {
      message.textContent = text;
    }
  } catch (error) {
    if (status) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}
