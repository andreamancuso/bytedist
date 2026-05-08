import { defineConfig } from "vite";

import { bytedistPlugin } from "bytedist/vite";

export default defineConfig({
  plugins: [
    bytedistPlugin({
      input: "./artifact",
      manifestPath: "manifest.json",
      embed: true
    })
  ],
  build: {
    outDir: "../.generated/vite-single-file",
    emptyOutDir: true
  }
});
