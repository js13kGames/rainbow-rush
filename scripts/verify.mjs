import { execFileSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archivePath, reportSize } from "./size.mjs";

await access(archivePath);
execFileSync("unzip", ["-t", archivePath], { stdio: "inherit" });
const listing = execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8" }).trim().split("\n");
const files = listing.filter((path) => !path.endsWith("/")).sort();
const expectedFiles = ["index.html"];

if (files.length !== expectedFiles.length || files.some((path, index) => path !== expectedFiles[index])) {
  throw new Error(`Unexpected archive paths: ${listing.join(", ")}`);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "rainbow-rush-"));
try {
  execFileSync("unzip", ["-q", archivePath, "-d", temporaryDirectory]);
  const extractedHtml = await readFile(join(temporaryDirectory, "index.html"), "utf8");
  if (/<script\b[^>]*\bsrc\s*=/.test(extractedHtml)) {
    throw new Error("Archive HTML references an external script");
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

console.log(`Top-level archive listing: ${listing.join(", ")}`);
await reportSize(false);
