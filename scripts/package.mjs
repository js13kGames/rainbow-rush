import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { minify } from "html-minifier-terser";
import { archivePath, reportSize } from "./size.mjs";

const builtHtmlPath = resolve("dist/index.html");
const html = await readFile(builtHtmlPath, "utf8");
const minifiedHtml = await minify(html, {
  collapseWhitespace: true,
  minifyCSS: true,
  removeAttributeQuotes: true,
  removeComments: true,
  removeOptionalTags: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  useShortDoctype: true,
});

await writeFile(builtHtmlPath, minifiedHtml);
await mkdir("release", { recursive: true });
await rm(archivePath, { force: true });
execFileSync("zip", ["-X", "-9", resolve(archivePath), "index.html"], {
  cwd: "dist",
  stdio: "inherit",
});
await reportSize(false);
