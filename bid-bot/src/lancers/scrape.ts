import type { Page } from "playwright";
import { selectors } from "./selectors.js";
import type { TaskSummary } from "../core/types.js";

function toAbsolute(href: string): string {
  if (href.startsWith("http")) return href;
  return `https://www.lancers.jp${href.startsWith("/") ? "" : "/"}${href}`;
}

export async function scrapeTasks(page: Page): Promise<TaskSummary[]> {
  const rows = await page.evaluate((s) => {
    const cards = [...document.querySelectorAll(s.taskCard)];
    const tasks: TaskSummary[] = [];
    const seen = new Set<string>();

    for (const card of cards) {
      const link = card.querySelector(s.taskTitleLink) as HTMLAnchorElement | null;
      if (!link) continue;
      const href = link.getAttribute("href") ?? "";
      const idMatch = /\/work\/detail\/(\d+)/.exec(href);
      if (!idMatch) continue;
      const workId = idMatch[1];
      if (seen.has(workId)) continue;
      seen.add(workId);

      const title = (link.textContent ?? "").trim().replace(/\s+/g, " ");
      const snippet = (card.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 1200);

      const values: number[] = [];
      const nums = card.querySelectorAll(`${s.taskPriceBlock} ${s.taskPriceNumber}`);
      for (const node of nums) {
        const n = Number((node.textContent ?? "").replace(/,/g, "").trim());
        if (Number.isFinite(n) && n > 0) values.push(n);
      }

      tasks.push({
        workId,
        url: href,
        title: title || snippet.slice(0, 120),
        snippet,
        budgetMinJpy: values.length ? Math.min(...values) : null,
        budgetMaxJpy: values.length ? Math.max(...values) : null,
      });
    }
    return tasks;
  }, selectors);

  return rows.map((t) => ({ ...t, url: toAbsolute(t.url) }));
}
