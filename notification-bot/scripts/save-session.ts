/**
 * One-time (or occasional) login helper: saves Playwright storage state for lancers.jp.
 * Usage: npm run session:save
 * Log in in the opened window, then press Enter in this terminal.
 */
import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const loginUrl =
  process.env.LANCERS_LOGIN_URL ?? "https://www.lancers.jp/user/login";
const storageStatePath =
  process.env.STORAGE_STATE_PATH ?? "./data/lancers-session.json";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  const rl = readline.createInterface({ input, output });
  await rl.question(
    "After you finish logging in in the browser, press Enter here to save session... ",
  );
  rl.close();

  await mkdir(dirname(storageStatePath), { recursive: true });
  await context.storageState({ path: storageStatePath });
  console.log(`Saved: ${storageStatePath}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
