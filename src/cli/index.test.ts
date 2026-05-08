import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PAYLOAD_HEADER_LENGTH } from "../index.js";
import { openPayload } from "../core/index.js";
import { runCli } from "./index.js";

const tempRoots: string[] = [];

describe("bytedist CLI", () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    );
  });

  it("prints help without listing extract", async () => {
    const result = await run(["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout.join("\n")).toContain("pack");
    expect(result.stdout.join("\n")).toContain("inspect");
    expect(result.stdout.join("\n")).toContain("verify");
    expect(result.stdout.join("\n")).not.toContain("extract");
  });

  it("fails unknown commands clearly", async () => {
    const result = await run(["extract"]);

    expect(result.code).toBe(1);
    expect(result.stderr.join("\n")).toContain("Unknown command: extract");
  });

  it("packs a directory with manifest and default integrity", async () => {
    const root = await createTempDir();
    const outputPath = path.join(root, "out", "demo.bytedist");
    await writeFixture(root, "input/manifest.json", JSON.stringify({ title: "Example" }));
    await writeFixture(root, "input/assets/a.txt", "hello");

    const result = await run([
      "pack",
      path.join(root, "input"),
      "--out",
      outputPath,
      "--manifest",
      "manifest.json"
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout.join("\n")).toContain("Packed ByteDist payload");
    expect(result.stdout.join("\n")).toContain("Chunks: 2");
    expect(result.stdout.join("\n")).toContain("Manifest: manifest.json");
    expect(result.stdout.join("\n")).toContain("Integrity: sha256");

    const archive = await openPayload(await fs.readFile(outputPath));
    expect(archive.list()).toEqual(["manifest.json", "assets/a.txt"]);
    await expect(archive.verify()).resolves.toBeUndefined();
  });

  it("requires --force before overwriting pack output", async () => {
    const root = await createTempDir();
    const inputDir = path.join(root, "input");
    const outputPath = path.join(root, "demo.bytedist");
    await writeFixture(root, "input/a.txt", "a");

    expect((await run(["pack", inputDir, "--out", outputPath])).code).toBe(0);

    const withoutForce = await run(["pack", inputDir, "--out", outputPath]);
    expect(withoutForce.code).toBe(1);
    expect(withoutForce.stderr.join("\n")).toContain("already exists");

    expect((await run(["pack", inputDir, "--out", outputPath, "--force"])).code).toBe(0);
  });

  it("honors ignore patterns during pack", async () => {
    const root = await createTempDir();
    const inputDir = path.join(root, "input");
    const outputPath = path.join(root, "demo.bytedist");
    await writeFixture(root, "input/keep.txt", "keep");
    await writeFixture(root, "input/drop.log", "drop");

    const result = await run(["pack", inputDir, "--out", outputPath, "--ignore", "*.log"]);

    expect(result.code).toBe(0);

    const archive = await openPayload(await fs.readFile(outputPath));
    expect(archive.list()).toEqual(["keep.txt"]);
  });

  it("creates readable hashless payloads that verify rejects", async () => {
    const root = await createTempDir();
    const inputDir = path.join(root, "input");
    const outputPath = path.join(root, "demo.bytedist");
    await writeFixture(root, "input/a.txt", "a");

    expect((await run(["pack", inputDir, "--out", outputPath, "--no-integrity"])).code).toBe(0);

    const verifyResult = await run(["verify", outputPath]);
    expect(verifyResult.code).toBe(1);
    expect(verifyResult.stderr.join("\n")).toContain("no integrity metadata");
  });

  it("inspects payload metadata and chunks", async () => {
    const root = await createTempDir();
    const inputDir = path.join(root, "input");
    const outputPath = path.join(root, "demo.bytedist");
    await writeFixture(root, "input/a.txt", "hello");
    expect((await run(["pack", inputDir, "--out", outputPath])).code).toBe(0);

    const result = await run(["inspect", outputPath]);
    const output = result.stdout.join("\n");

    expect(result.code).toBe(0);
    expect(output).toContain("Format version: 0");
    expect(output).toContain("Chunk count: 1");
    expect(output).toContain("- a.txt | size=5 | mime=text/plain | compression=none | hash=sha256");
  });

  it("verifies valid payloads", async () => {
    const root = await createTempDir();
    const inputDir = path.join(root, "input");
    const outputPath = path.join(root, "demo.bytedist");
    await writeFixture(root, "input/a.txt", "a");
    expect((await run(["pack", inputDir, "--out", outputPath])).code).toBe(0);

    const result = await run(["verify", outputPath]);

    expect(result.code).toBe(0);
    expect(result.stdout.join("\n")).toContain("Verification passed");
  });

  it("reports failing chunks for tampered payloads", async () => {
    const root = await createTempDir();
    const inputDir = path.join(root, "input");
    const outputPath = path.join(root, "demo.bytedist");
    await writeFixture(root, "input/a.txt", "a");
    expect((await run(["pack", inputDir, "--out", outputPath])).code).toBe(0);

    const bytes = await fs.readFile(outputPath);
    bytes[PAYLOAD_HEADER_LENGTH] = bytes[PAYLOAD_HEADER_LENGTH] === 97 ? 98 : 97;
    await fs.writeFile(outputPath, bytes);

    const result = await run(["verify", outputPath]);

    expect(result.code).toBe(1);
    expect(result.stderr.join("\n")).toContain("Verification failed");
    expect(result.stderr.join("\n")).toContain("Chunk: a.txt");
  });

  it("fails invalid payloads during verify", async () => {
    const root = await createTempDir();
    const payloadPath = path.join(root, "bad.bytedist");
    await fs.writeFile(payloadPath, new Uint8Array([1, 2, 3]));

    const result = await run(["verify", payloadPath]);

    expect(result.code).toBe(1);
    expect(result.stderr.join("\n")).toContain("Verification failed");
  });
});

async function run(argv: readonly string[]): Promise<{
  readonly code: number;
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message)
  });

  return { code, stdout, stderr };
}

async function createTempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bytedist-cli-"));
  tempRoots.push(root);
  return root;
}

async function writeFixture(root: string, relativePath: string, contents: string): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents);
}
