// Bundles the client app into one self-contained HTML file: node scripts/build-preview.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("preview/dist", { recursive: true });
await build({
  entryPoints: ["preview/entry.tsx"], bundle: true, minify: true, format: "iife", outdir: "preview/dist",
  loader: { ".webp": "dataurl", ".woff2": "dataurl", ".woff": "dataurl" }, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  tsconfig: "tsconfig.json", logLevel: "warning",
});
const js = readFileSync("preview/dist/entry.js", "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync("preview/dist/entry.css", "utf8");
const icon = "data:image/png;base64," + readFileSync("app/icon.png").toString("base64");
writeFileSync("preview/dist/index.html", `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bunbun Bakery · Production Scheduler</title><link rel="icon" href="${icon}"><style>${css}</style></head>
<body><div id="root"></div><script>${js}</script></body></html>`);
console.log("preview/dist/index.html", (readFileSync("preview/dist/index.html").length / 1024).toFixed(0) + " KB");