import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "wasm", "dist");
const imageName = "bytedist-wasm-builder:emsdk-5.0.2";

fs.mkdirSync(outDir, { recursive: true });

run("docker", ["build", "-t", imageName, "-f", "wasm/Dockerfile", "."], repoRoot);
run(
  "docker",
  [
    "run",
    "--rm",
    "-v",
    `${repoRoot}:/work`,
    "-w",
    "/work",
    imageName,
    "emcc",
    "wasm/src/bytedist_wasm.cpp",
    "-O2",
    "-std=c++20",
    "-s",
    "MODULARIZE=1",
    "-s",
    "EXPORT_ES6=1",
    "-s",
    "ENVIRONMENT=web,node",
    "-s",
    "ALLOW_MEMORY_GROWTH=1",
    "-s",
    "EXPORTED_FUNCTIONS=['_bd_malloc','_bd_free','_bd_open','_bd_close','_bd_chunk_count','_bd_chunk_name_ptr','_bd_chunk_name_len','_bd_read_chunk','_bd_result_ptr','_bd_result_len','_bd_last_error_code','_bd_last_error_message_ptr','_bd_last_error_message_len']",
    "-s",
    "EXPORTED_RUNTIME_METHODS=['HEAPU8']",
    "-o",
    "wasm/dist/bytedist_wasm.mjs"
  ],
  repoRoot
);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
