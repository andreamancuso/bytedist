import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("public documentation", () => {
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
