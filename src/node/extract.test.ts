import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createPayload, openPayload, PayloadFormatError, type OpenedPayload } from "../index.js";
import { extractPayloadToDirectory, planPayloadExtraction } from "./extract.js";

const textEncoder = new TextEncoder();
const tempRoots: string[] = [];

describe("internal extraction safety helpers", () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    );
  });

  it("plans normal nested chunk names under the output directory", async () => {
    const root = await createTempDir();
    const archive = mockArchive(["manifest.json", "assets/image.webp"]);

    await expect(planPayloadExtraction(archive, root)).resolves.toEqual([
      {
        chunkName: "manifest.json",
        outputPath: path.join(root, "manifest.json"),
        length: 1
      },
      {
        chunkName: "assets/image.webp",
        outputPath: path.join(root, "assets", "image.webp"),
        length: 1
      }
    ]);
  });

  it.each([
    "../secret.txt",
    "/absolute.txt",
    "C:/absolute.txt",
    "a/./b.txt",
    "a\\b.txt",
    "bad\0name.txt"
  ])("rejects unsafe chunk path %s", async (chunkName) => {
    const root = await createTempDir();

    await expect(planPayloadExtraction(mockArchive([chunkName]), root)).rejects.toThrow(
      PayloadFormatError
    );
  });

  it.each([
    "bad<name.txt",
    "bad>name.txt",
    "bad:name.txt",
    'bad"name.txt',
    "bad|name.txt",
    "bad?name.txt",
    "bad*name.txt",
    "trailing-space ",
    "trailing-dot.",
    "CON",
    "nul.txt",
    "COM1.log",
    "LPT9"
  ])("rejects Windows-unsafe extraction name %s", async (chunkName) => {
    const root = await createTempDir();

    await expect(planPayloadExtraction(mockArchive([chunkName]), root)).rejects.toThrow(
      PayloadFormatError
    );
  });

  it("rejects case-insensitive target collisions", async () => {
    const root = await createTempDir();

    await expect(
      planPayloadExtraction(mockArchive(["assets/a.txt", "assets/A.TXT"]), root)
    ).rejects.toThrow(PayloadFormatError);
  });

  it("writes chunks to nested directories", async () => {
    const root = await createTempDir();
    const archive = await openPayload(
      await createPayload({
        files: [
          { name: "a.txt", bytes: textEncoder.encode("a") },
          { name: "nested/b.txt", bytes: textEncoder.encode("b") }
        ]
      })
    );

    const extracted = await extractPayloadToDirectory(archive, root);

    expect(extracted.map((file) => file.chunkName)).toEqual(["a.txt", "nested/b.txt"]);
    await expect(fs.readFile(path.join(root, "a.txt"), "utf8")).resolves.toBe("a");
    await expect(fs.readFile(path.join(root, "nested", "b.txt"), "utf8")).resolves.toBe("b");
  });

  it("refuses to overwrite existing files by default", async () => {
    const root = await createTempDir();
    const archive = await archiveWithTextFile("a.txt", "new");
    await writeFixture(root, "a.txt", "old");

    await expect(extractPayloadToDirectory(archive, root)).rejects.toThrow(PayloadFormatError);
    await expect(fs.readFile(path.join(root, "a.txt"), "utf8")).resolves.toBe("old");
  });

  it("checks overwrite conflicts before writing any chunk", async () => {
    const root = await createTempDir();
    const archive = await openPayload(
      await createPayload({
        files: [
          { name: "a.txt", bytes: textEncoder.encode("a") },
          { name: "b.txt", bytes: textEncoder.encode("b") }
        ]
      })
    );
    await writeFixture(root, "b.txt", "old");

    await expect(extractPayloadToDirectory(archive, root)).rejects.toThrow(PayloadFormatError);
    await expect(fs.readdir(root)).resolves.toEqual(["b.txt"]);
  });

  it("overwrites existing regular files when requested", async () => {
    const root = await createTempDir();
    const archive = await archiveWithTextFile("a.txt", "new");
    await writeFixture(root, "a.txt", "old");

    await expect(
      extractPayloadToDirectory(archive, root, { overwrite: true })
    ).resolves.toMatchObject([{ chunkName: "a.txt", bytesWritten: 3 }]);
    await expect(fs.readFile(path.join(root, "a.txt"), "utf8")).resolves.toBe("new");
  });

  it("rejects existing directories at target paths", async () => {
    const root = await createTempDir();
    const archive = await archiveWithTextFile("a.txt", "new");
    await fs.mkdir(path.join(root, "a.txt"));

    await expect(extractPayloadToDirectory(archive, root, { overwrite: true })).rejects.toThrow(
      PayloadFormatError
    );
  });

  it("rejects existing symlinks at target paths", async () => {
    const root = await createTempDir();
    const archive = await archiveWithTextFile("a.txt", "new");
    await writeFixture(root, "target.txt", "target");

    try {
      await fs.symlink(path.join(root, "target.txt"), path.join(root, "a.txt"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        return;
      }

      throw error;
    }

    await expect(extractPayloadToDirectory(archive, root, { overwrite: true })).rejects.toThrow(
      PayloadFormatError
    );
  });

  it("verifies payload integrity before writing when requested", async () => {
    const root = await createTempDir();
    const archive = await archiveWithTextFile("a.txt", "a");

    await expect(extractPayloadToDirectory(archive, root, { verify: true })).rejects.toThrow(
      "no integrity metadata"
    );
    await expect(fs.readdir(root)).resolves.toEqual([]);
  });

  it("writes after successful requested verification", async () => {
    const root = await createTempDir();
    const archive = await openPayload(
      await createPayload({
        files: [{ name: "a.txt", bytes: textEncoder.encode("a") }],
        integrity: "sha256"
      })
    );

    await expect(extractPayloadToDirectory(archive, root, { verify: true })).resolves.toHaveLength(
      1
    );
    await expect(fs.readFile(path.join(root, "a.txt"), "utf8")).resolves.toBe("a");
  });
});

async function archiveWithTextFile(name: string, text: string): Promise<OpenedPayload> {
  return openPayload(
    await createPayload({
      files: [{ name, bytes: textEncoder.encode(text) }]
    })
  );
}

function mockArchive(chunkNames: readonly string[]): OpenedPayload {
  return {
    formatVersion: 0,
    getToc: () => ({
      version: 0,
      tocEncoding: "json",
      chunks: chunkNames.map((name) => ({
        name,
        offset: 24,
        length: 1,
        storedLength: 1,
        compression: "none"
      }))
    }),
    list: () => chunkNames,
    has: (name) => chunkNames.includes(name),
    readBytes: async () => new Uint8Array([1]),
    readText: async () => "\u0001",
    readJson: async <T>() => null as T,
    verify: async () => undefined,
    close: () => undefined
  };
}

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
