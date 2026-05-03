import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { config } from "../src/core/config.js";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.lancers.jp/", { waitUntil: "domcontentloaded" });
  console.log("Please login manually, then press Enter in this terminal.");

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  await mkdir(dirname(config.storageStatePath), { recursive: true });
  await context.storageState({ path: config.storageStatePath });
  await browser.close();
  console.log(`Saved storage state to ${config.storageStatePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
