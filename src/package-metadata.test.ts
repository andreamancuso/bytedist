import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const VITE_PEER_RANGE = "^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0-0";

describe("package metadata", () => {
  it("keeps Vite optional while supporting current consumer versions", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    ) as {
      readonly dependencies?: Record<string, string>;
      readonly peerDependencies?: Record<string, string>;
      readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>;
    };

    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.peerDependencies?.["vite"]).toBe(VITE_PEER_RANGE);
    expect(packageJson.peerDependenciesMeta?.["vite"]?.optional).toBe(true);
  });
});
