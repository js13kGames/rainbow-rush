import { stat } from "node:fs/promises";
import process from "node:process";

export const archivePath = "release/rainbow-rush.zip";
export const byteLimit = Number(process.env.JS13K_LIMIT ?? 13_312);

export async function reportSize(check = false) {
  let bytes;
  try {
    bytes = (await stat(archivePath)).size;
  } catch {
    console.error(`Archive missing: ${archivePath}`);
    process.exitCode = 1;
    return;
  }

  const remaining = byteLimit - bytes;
  console.log(`Archive: ${archivePath}`);
  console.log(`Bytes: ${bytes}`);
  console.log(`Limit: ${byteLimit}`);
  console.log(`${remaining >= 0 ? "Remaining" : "Excess"}: ${Math.abs(remaining)}`);
  if (check && remaining < 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("size.mjs")) {
  await reportSize(process.argv.includes("--check"));
}
