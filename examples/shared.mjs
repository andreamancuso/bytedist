import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const generatedRoot = path.join(repoRoot, "examples", ".generated");

export async function resetOutputDir(name) {
  const outputDir = path.join(generatedRoot, name);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  return outputDir;
}

export async function writeFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

export function toBase64(bytes, lineLength = 76) {
  const text = Buffer.from(bytes).toString("base64");
  return text.match(new RegExp(`.{1,${lineLength}}`, "g"))?.join("\n") ?? "";
}

export function tinyPngBytes(hexColor) {
  const color = Number.parseInt(hexColor.replace("#", ""), 16);
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="rgb(${red},${green},${blue})"/><circle cx="48" cy="48" r="24" fill="white" fill-opacity=".7"/></svg>`;
  return new TextEncoder().encode(svg);
}

export function logSuccess(title, details) {
  console.log(`${title}`);
  for (const detail of details) {
    console.log(`- ${detail}`);
  }
}
