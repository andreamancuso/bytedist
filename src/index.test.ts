import { describe, expect, it } from "vitest";

import { BYTEDIST_PACKAGE_NAME, BYTEDIST_PACKAGE_STATUS } from "./index.js";

describe("package skeleton", () => {
  it("exports placeholder package metadata", () => {
    expect(BYTEDIST_PACKAGE_NAME).toBe("bytedist");
    expect(BYTEDIST_PACKAGE_STATUS).toBe("package-skeleton");
  });
});
