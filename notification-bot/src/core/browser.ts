import { chromium, type Browser, type BrowserContext } from "playwright";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { config } from "./config.js";

export type BrowserHandle = {
  browser: Browser;
  context: BrowserContext;
};

export async function createBrowserContext(): Promise<BrowserHandle> {
  const browser = await chromium.launch({
    headless: config.headless,
  });

  if (existsSync(config.storageStatePath)) {
    const context = await browser.newContext({
      storageState: config.storageStatePath,
    });
    return { browser, context };
  }

  if (config.cookiesPath && existsSync(config.cookiesPath)) {
    const context = await browser.newContext();
    const raw = await readFile(config.cookiesPath, "utf8");
    const cookies = JSON.parse(raw) as Parameters<BrowserContext["addCookies"]>[0];
    await context.addCookies(cookies);
    return { browser, context };
  }

  console.error(
    "No session found. Run: npm run session:save\n" +
      `Or place Playwright storage state at ${config.storageStatePath} or cookies at ${config.cookiesPath ?? "(COOKIES_PATH)"}.`,
  );
  await browser.close();
  process.exit(1);
}
