import type { BrowserContext, Page } from "playwright";
import { LANCERS_HEADER_LOGIN_HREF, LANCERS_SESSION_PROBE_URL } from "./constants.js";

export function lancersHeaderLoginLink(page: Page) {
  return page.locator(`a[href="${LANCERS_HEADER_LOGIN_HREF}"]`).first();
}

/** True when the header “ログイン” link is present (unauthenticated session). */
export async function isLancersLoggedOutOnPage(page: Page): Promise<boolean> {
  const link = lancersHeaderLoginLink(page);
  return (await link.count()) > 0;
}

/** Opens a throwaway tab, loads the home page, and checks the global header login link. */
export async function probeLancersLoggedOut(context: BrowserContext): Promise<boolean> {  const page = await context.newPage();
  try {
    await page.goto(LANCERS_SESSION_PROBE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(800);
    return await isLancersLoggedOutOnPage(page);
  } finally {
    await page.close();
  }
}
