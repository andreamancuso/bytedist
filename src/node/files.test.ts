import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openPayload, PayloadFormatError } from "../index.js";
import { collectDirectoryFiles, detectMimeType, packDirectory, writePayloadFile } from "./index.js";

const tempRoots: string[] = [];

describe("node filesystem helpers", () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    );
  });

  it("recursively collects files with normalized sorted chunk names and MIME types", async () => {
    const root = await createTempDir();
    await writeFixture(root, "z.txt", "z");
    await writeFixture(root, "nested/a.json", "{}");
    await writeFixture(root, "nested/image.webp", new Uint8Array([1, 2, 3]));

    const files = await collectDirectoryFiles(root);

    expect(files.map((file) => file.name)).toEqual(["nested/a.json", "nested/image.webp", "z.txt"]);
    expect(files.map((file) => file.mime)).toEqual([
      "application/json",
      "image/webp",
      "text/plain"
    ]);
  });

  it("applies exact, directory-prefix, single-segment, and cross-segment ignore patterns", async () => {
    const root = await createTempDir();
    await writeFixture(root, "keep.txt", "keep");
    await writeFixture(root, "exact.txt", "exact");
    await writeFixture(root, "tmp/a.txt", "tmp");
    await writeFixture(root, "assets/a.map", "map");
    await writeFixture(root, "assets/deep/b.log", "log");

    const files = await collectDirectoryFiles(root, {
      ignore: ["exact.txt", "tmp/", "assets/*.map", "**/*.log"]
    });

    expect(files.map((file) => file.name)).toEqual(["keep.txt"]);
  });

  it("skips symlinks", async () => {
    const root = await createTempDir();
    await writeFixture(root, "target.txt", "target");

    try {
      await fs.symlink(path.join(root, "target.txt"), path.join(root, "link.txt"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }

      throw error;
    }

    const files = await collectDirectoryFiles(root);

    expect(files.map((file) => file.name)).toEqual(["target.txt"]);
  });

  it("packs a directory and verifies the generated payload", async () => {
    const root = await createTempDir();
    await writeFixture(root, "manifest.source.json", JSON.stringify({ title: "Example" }));
    await writeFixture(root, "asset.txt", "hello");

    const payload = await packDirectory(root, {
      manifestPath: "manifest.source.json",
      integrity: "sha256",
      createdBy: "bytedist-test"
    });
    const archive = await openPayload(payload);

    expect(archive.list()).toEqual(["manifest.json", "asset.txt"]);
    await expect(archive.readJson("manifest.json")).resolves.toEqual({ title: "Example" });
    await expect(archive.readText("asset.txt")).resolves.toBe("hello");
    await expect(archive.verify()).resolves.toBeUndefined();
  });

  it("produces identical payload bytes for repeated directory packs", async () => {
    const root = await createTempDir();
    await writeFixture(root, "z.txt", "z");
    await writeFixture(root, "nested/a.txt", "a");

    await expect(
      packDirectory(root, {
        integrity: "sha256",
        createdBy: "bytedist-test"
      })
    ).resolves.toEqual(
      await packDirectory(root, {
        integrity: "sha256",
        createdBy: "bytedist-test"
      })
    );
  });

  it("sorts directory chunks independently of filesystem creation order", async () => {
    const left = await createTempDir();
    const right = await createTempDir();
    await writeFixture(left, "z.txt", "z");
    await writeFixture(left, "a.txt", "a");
    await writeFixture(right, "a.txt", "a");
    await writeFixture(right, "z.txt", "z");

    const leftPayload = await packDirectory(left, { integrity: "sha256" });
    const rightPayload = await packDirectory(right, { integrity: "sha256" });
    const archive = await openPayload(leftPayload);

    expect(archive.list()).toEqual(["a.txt", "z.txt"]);
    expect(leftPayload).toEqual(rightPayload);
  });

  it("does not include filesystem mtimes in packed payloads", async () => {
    const root = await createTempDir();
    const filePath = await writeFixture(root, "asset.txt", "asset");
    const before = await packDirectory(root, { integrity: "sha256" });

    await fs.utimes(filePath, new Date("2001-01-01T00:00:00Z"), new Date("2001-01-01T00:00:00Z"));
    const after = await packDirectory(root, { integrity: "sha256" });

    expect(after).toEqual(before);
  });

  it("passes compression codecs through directory packing", async () => {
    const root = await createTempDir();
    await writeFixture(root, "asset.txt", "aaaaaa");

    const payload = await packDirectory(root, {
      compression: "fake",
      compressionCodecs: [fakeShrinkingCodec]
    });
    const archive = await openPayload(payload, { compressionCodecs: [fakeShrinkingCodec] });

    expect(archive.getToc().chunks[0]).toMatchObject({
      name: "asset.txt",
      compression: "fake",
      length: 6,
      storedLength: 2
    });
    await expect(archive.readText("asset.txt")).resolves.toBe("aaaaaa");
  });

  it("rejects invalid JSON manifest files", async () => {
    const root = await createTempDir();
    await writeFixture(root, "manifest.json", "{");

    await expect(packDirectory(root, { manifestPath: "manifest.json" })).rejects.toThrow(
      PayloadFormatError
    );
  });

  it("rejects manifest paths outside the input directory", async () => {
    const root = await createTempDir();
    const outside = await createTempDir();
    await writeFixture(outside, "manifest.json", "{}");

    await expect(packDirectory(root, { manifestPath: "../manifest.json" })).rejects.toThrow(
      PayloadFormatError
    );
  });

  it("rejects explicit manifest.json chunks when manifestPath is provided", async () => {
    const root = await createTempDir();
    await writeFixture(root, "manifest.source.json", "{}");
    await writeFixture(root, "manifest.json", "{}");

    await expect(packDirectory(root, { manifestPath: "manifest.source.json" })).rejects.toThrow(
      PayloadFormatError
    );
  });

  it("keeps manifestPath usable even when ignored", async () => {
    const root = await createTempDir();
    await writeFixture(root, "manifest.source.json", "{}");
    await writeFixture(root, "asset.txt", "asset");

    const payload = await packDirectory(root, {
      manifestPath: "manifest.source.json",
      ignore: ["manifest.source.json"]
    });
    const archive = await openPayload(payload);

    expect(archive.list()).toEqual(["manifest.json", "asset.txt"]);
  });

  it("detects common MIME types and defaults unknown extensions", () => {
    expect(detectMimeType("data.json")).toBe("application/json");
    expect(detectMimeType("index.HTML")).toBe("text/html");
    expect(detectMimeType("module.wasm")).toBe("application/wasm");
    expect(detectMimeType("image.jpeg")).toBe("image/jpeg");
    expect(detectMimeType("unknown.custom")).toBe("application/octet-stream");
  });

  it("writes payload files, creates parents, and requires explicit overwrite", async () => {
    const root = await createTempDir();
    const outputPath = path.join(root, "nested", "artifact.bytedist");

    await writePayloadFile(outputPath, new Uint8Array([1, 2, 3]));
    await expect(fs.readFile(outputPath)).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(writePayloadFile(outputPath, new Uint8Array([4]))).rejects.toThrow(
      PayloadFormatError
    );

    await writePayloadFile(outputPath, new Uint8Array([4]), { overwrite: true });
    await expect(fs.readFile(outputPath)).resolves.toEqual(Buffer.from([4]));
  });
});

async function createTempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bytedist-"));
  tempRoots.push(root);
  return root;
}

async function writeFixture(
  root: string,
  relativePath: string,
  contents: string | Uint8Array
): Promise<string> {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents);
  return absolutePath;
}

const fakeShrinkingCodec = {
  name: "fake",
  async compress(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array([bytes.byteLength, bytes[0] ?? 0]);
  },
  async decompress(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(bytes[0] ?? 0).fill(bytes[1] ?? 0);
  }
};
