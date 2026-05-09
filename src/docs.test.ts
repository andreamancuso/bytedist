import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("public documentation", () => {
  it("documents the public README surface", async () => {
    const readme = await fs.readFile(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("bytedist pack");
    expect(readme).toContain("bytedist inspect");
    expect(readme).toContain("bytedist verify");
    expect(readme).toContain("bytedist sign");
    expect(readme).toContain("bytedist verify-signature");
    expect(readme).toContain("bytedist bundle-html");
    expect(readme).toContain("createPayload");
    expect(readme).toContain("openPayload");
    expect(readme).toContain("computePayloadHash");
    expect(readme).toContain("openPayloadFromUrlRange");
    expect(readme).toContain("bytedistPlugin");
    expect(readme).toContain("bytedist/vite");
    expect(readme).toContain("single-file");
    expect(readme).toContain("npm run example:basic");
    expect(readme).toContain("npm run example:browser-gallery");
    expect(readme).toContain("npm run example:single-file-html");
    expect(readme).toContain("npm run example:interactive-document");
    expect(readme).toContain("npm run example:vite");
    expect(readme).toContain("npm run example:all");
    expect(readme).toContain("not DRM");
    expect(readme).toContain("must not be used to hide secrets");
    expect(readme).toContain("Experimental WASM reader/validator wrapper");
    expect(readme).toContain("Browser loading notes");
    expect(readme).toContain("Deterministic build notes");
    expect(readme).toContain("Signing and provenance notes");
    expect(readme).toContain("Vite integration notes");

    for (const comparison of ["ZIP", "Emscripten", "Vite", "Web Bundles", "glTF/GLB"]) {
      expect(readme).toContain(comparison);
    }

    for (const useCase of [
      "Local-first app exports",
      "Browser-based editor standalone exports",
      "Interactive documents",
      "Kiosk, demo, and training artifacts",
      "Web games and visualizations"
    ]) {
      expect(readme).toContain(useCase);
    }
  });

  it("documents the current payload format surface", async () => {
    const formatDoc = await fs.readFile(new URL("../docs/format.md", import.meta.url), "utf8");

    expect(formatDoc).toContain("BDISTPAY");
    expect(formatDoc).toContain("BDISTEND");
    expect(formatDoc).toContain("format version `0`");
    expect(formatDoc).toContain("`24` bytes");
    expect(formatDoc).toContain("`40` bytes");
    expect(formatDoc).toContain("length");
    expect(formatDoc).toContain("storedLength");
    expect(formatDoc).toContain("SHA-256");
    expect(formatDoc).toContain("logical uncompressed chunk bytes");
    expect(formatDoc).toContain("compression codec");
    expect(formatDoc).toContain('tocEncoding: "json"');
    expect(formatDoc).toContain("npm run toc:measure");
    expect(formatDoc).toContain("JSON remains the only supported v0 TOC encoding");
    expect(formatDoc).toContain("Detached Signatures");
    expect(formatDoc).toContain("pre-1.0");
  });

  it("documents payload signing behavior", async () => {
    const signingDoc = await fs.readFile(new URL("../docs/signing.md", import.meta.url), "utf8");

    expect(signingDoc).toContain("detached");
    expect(signingDoc).toContain("ECDSA-P256-SHA256");
    expect(signingDoc).toContain("bytedist sign");
    expect(signingDoc).toContain("bytedist verify-signature");
    expect(signingDoc).toContain("private keys");
    expect(signingDoc).toContain("not DRM");
  });

  it("documents deterministic build behavior", async () => {
    const deterministicDoc = await fs.readFile(
      new URL("../docs/deterministic-builds.md", import.meta.url),
      "utf8"
    );

    expect(deterministicDoc).toContain("chunkOrder");
    expect(deterministicDoc).toContain('"name"');
    expect(deterministicDoc).toContain("computePayloadHash");
    expect(deterministicDoc).toContain("does not emit implicit timestamps");
    expect(deterministicDoc).toContain("packDirectory");
    expect(deterministicDoc).toContain("not authenticity");
  });

  it("documents Vite integration behavior", async () => {
    const viteDoc = await fs.readFile(new URL("../docs/vite.md", import.meta.url), "utf8");

    expect(viteDoc).toContain("bytedist/vite");
    expect(viteDoc).toContain("bytedistPlugin");
    expect(viteDoc).toContain("virtual:bytedist/payload");
    expect(viteDoc).toContain("BYTEDIST_PAYLOAD");
    expect(viteDoc).toContain("build-only");
    expect(viteDoc).toContain("not DRM");
  });

  it("documents the experimental WASM reader surface", async () => {
    const wasmDoc = await fs.readFile(new URL("../docs/wasm.md", import.meta.url), "utf8");

    expect(wasmDoc).toContain("not a security boundary");
    expect(wasmDoc).toContain("openPayloadWithWasm");
    expect(wasmDoc).toContain("openEmbeddedPayloadWithWasm");
    expect(wasmDoc).toContain("npm run wasm:build");
    expect(wasmDoc).toContain("npm run wasm:test");
    expect(wasmDoc).toContain("TypeScript reader remains the canonical");
    expect(wasmDoc).toContain("Memory ownership rules");
  });

  it("documents browser loading behavior", async () => {
    const browserDoc = await fs.readFile(new URL("../docs/browser.md", import.meta.url), "utf8");

    expect(browserDoc).toContain("openPayloadFromUrlRange");
    expect(browserDoc).toContain("Range: bytes=-40");
    expect(browserDoc).toContain("full base64 decode");
    expect(browserDoc).toContain('cache: "bytes"');
    expect(browserDoc).toContain("object URLs");
  });
});
