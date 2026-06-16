#!/usr/bin/env node
// Rasterizes the brand SVG into the PNG sizes WXT auto-detects from
// `public/icon/<size>.png` (manifest `icons` + `action.default_icon`).
// Source SVG is vendored at `assets/forge-icon-24.svg` so this app stays
// standalone (it is not part of the monorepo workspace). Re-run with `yarn icons`.
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(projectRoot, "assets/forge-icon-24.svg");
const OUT_DIR = path.join(projectRoot, "public/icon");

// Chrome uses 16/32/48/128; 48 covers Firefox too.
const SIZES = [16, 32, 48, 128];
// Logo occupies this fraction of the square; the rest is transparent breathing room.
const CONTENT_RATIO = 0.86;

const svg = await readFile(SRC);
await mkdir(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const inner = Math.round(size * CONTENT_RATIO);
  // Oversample the vector (high density), fit-contain into the inner box keeping
  // aspect ratio, then center on a transparent square canvas.
  const logo = await sharp(svg, { density: 384 })
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT_DIR, `${size}.png`));

  console.log(`[gen-icons] wrote public/icon/${size}.png`);
}
