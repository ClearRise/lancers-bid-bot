import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { config } from "./config.js";

export async function openContext(): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({ storageState: config.storageStatePath });
  const page = await context.newPage();
  return { browser, context, page };
}
