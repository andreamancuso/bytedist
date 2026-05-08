import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("public documentation", () => {
  it("documents the public README surface", async () => {
    const readme = await fs.readFile(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("bytedist pack");
    expect(readme).toContain("bytedist inspect");
    expect(readme).toContain("bytedist verify");
    expect(readme).toContain("bytedist bundle-html");
    expect(readme).toContain("createPayload");
    expect(readme).toContain("openPayload");
    expect(readme).toContain("single-file");
    expect(readme).toContain("npm run example:basic");
    expect(readme).toContain("npm run example:browser-gallery");
    expect(readme).toContain("npm run example:single-file-html");
    expect(readme).toContain("npm run example:interactive-document");
    expect(readme).toContain("npm run example:all");
    expect(readme).toContain("not DRM");
    expect(readme).toContain("must not be used to hide secrets");

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
    expect(formatDoc).toContain("pre-1.0");
  });
});
