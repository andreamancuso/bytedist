import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { build, type InlineConfig } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { openPayload } from "../core/index.js";
import { decodeBase64 } from "../html/index.js";
import { bytedistPlugin } from "./index.js";

const tempRoots: string[] = [];

describe("bytedistPlugin", () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    );
  });

  it("embeds a generated payload into Vite HTML", async () => {
    const root = await createViteProject({
      html: htmlWithPayloadMarker(),
      mainJs: `
        import metadata from "virtual:bytedist/payload";
        window.__metadata = metadata;
      `
    });

    await runViteBuild(root, {
      embed: true
    });

    const html = await fs.readFile(path.join(root, "dist", "index.html"), "utf8");
    const archive = await openPayload(readEmbeddedPayload(html));

    expect(html).toContain('type="application/octet-stream+base64"');
    expect(html).not.toContain("<!-- BYTEDIST_PAYLOAD -->");
    expect(await archive.readJson("manifest.json")).toEqual({ entry: "content/message.txt" });
    await expect(archive.readText("content/message.txt")).resolves.toBe("Hello from Vite");
    expect(await outputContains(root, "embedded:!0")).toBe(true);
  });

  it("embeds identical payload bytes across repeated Vite builds", async () => {
    const root = await createViteProject({
      html: htmlWithPayloadMarker(),
      mainJs: "console.log('deterministic payload');"
    });

    await runViteBuild(root, {
      embed: true
    });
    const firstHtml = await fs.readFile(path.join(root, "dist", "index.html"), "utf8");

    await runViteBuild(root, {
      embed: true
    });
    const secondHtml = await fs.readFile(path.join(root, "dist", "index.html"), "utf8");

    expect(readEmbeddedPayload(secondHtml)).toEqual(readEmbeddedPayload(firstHtml));
  });

  it("emits a payload asset when emit is enabled", async () => {
    const root = await createViteProject({
      html: htmlWithPayloadMarker(),
      mainJs: `
        import { outputName, payloadSize, chunks } from "virtual:bytedist/payload";
        window.__metadata = { outputName, payloadSize, chunks };
      `
    });

    await runViteBuild(root, {
      embed: false,
      emit: true,
      outputName: "assets/demo.bytedist"
    });

    const payloadPath = path.join(root, "dist", "assets", "demo.bytedist");
    const archive = await openPayload(await fs.readFile(payloadPath));

    expect(await archive.readText("content/message.txt")).toBe("Hello from Vite");
    expect(await outputContains(root, "assets/demo.bytedist")).toBe(true);
    expect(await outputContains(root, "payloadSize")).toBe(true);
  });

  it("embeds optional WASM bytes", async () => {
    const root = await createViteProject({
      html: `${htmlWithPayloadMarker()}<!-- BYTEDIST_WASM -->`,
      mainJs: "console.log('wasm example');"
    });
    await fs.writeFile(path.join(root, "reader.wasm"), new Uint8Array([0, 97, 115, 109]));

    await runViteBuild(root, {
      embed: true,
      wasm: "reader.wasm"
    });

    const html = await fs.readFile(path.join(root, "dist", "index.html"), "utf8");

    expect(html).toContain('type="application/wasm+base64"');
    expect(html).toContain("AGFzbQ==");
  });

  it("fails clearly when embed is enabled and the payload marker is missing", async () => {
    const root = await createViteProject({
      html: '<!doctype html><html><body><script type="module" src="/src/main.js"></script></body></html>',
      mainJs: "console.log('missing marker');"
    });

    await expect(
      runViteBuild(root, {
        embed: true
      })
    ).rejects.toThrow("payload marker");
  });
});

async function runViteBuild(
  root: string,
  pluginOptions: Partial<Parameters<typeof bytedistPlugin>[0]>
): Promise<void> {
  const config: InlineConfig = {
    root,
    logLevel: "silent",
    plugins: [
      bytedistPlugin({
        input: "./artifact",
        manifestPath: "manifest.json",
        ...pluginOptions
      })
    ],
    build: {
      outDir: "dist",
      emptyOutDir: true
    }
  };

  await build(config);
}

async function createViteProject(options: {
  readonly html: string;
  readonly mainJs: string;
}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bytedist-vite-"));
  tempRoots.push(root);

  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "artifact", "content"), { recursive: true });
  await fs.writeFile(path.join(root, "index.html"), options.html);
  await fs.writeFile(path.join(root, "src", "main.js"), options.mainJs);
  await fs.writeFile(
    path.join(root, "artifact", "manifest.json"),
    JSON.stringify({ entry: "content/message.txt" })
  );
  await fs.writeFile(path.join(root, "artifact", "content", "message.txt"), "Hello from Vite");

  return root;
}

function htmlWithPayloadMarker(): string {
  return [
    "<!doctype html>",
    "<html>",
    "<body>",
    "<!-- BYTEDIST_PAYLOAD -->",
    '<script type="module" src="/src/main.js"></script>',
    "</body>",
    "</html>"
  ].join("");
}

function readEmbeddedPayload(html: string): Uint8Array {
  const match = html.match(
    /<script type="application\/octet-stream\+base64" data-bytedist-payload>\s*([\s\S]*?)\s*<\/script>/
  );
  expect(match?.[1]).toBeDefined();
  return decodeBase64(match?.[1] ?? "");
}

async function outputContains(root: string, text: string): Promise<boolean> {
  const files = await collectFiles(path.join(root, "dist"));
  const contents = await Promise.all(files.map((file) => fs.readFile(file, "utf8")));
  return contents.some((content) => content.includes(text));
}

async function collectFiles(root: string): Promise<readonly string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}
