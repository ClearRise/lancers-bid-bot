import type { Page } from "playwright";
import type { ScrapedTask } from "../../core/types.js";

/** Pull yen amounts like ¥12,345 or 12345円 from text */
export function extractBudgetJpy(text: string): number | null {
  const normalized = text.replace(/\s+/g, " ");
  const patterns = [
    /[¥￥]\s*([\d,]+)/g,
    /([\d,]+)\s*円/g,
    /予算\s*[：:]\s*[¥￥]?\s*([\d,]+)/i,
  ];
  const candidates: number[] = [];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(normalized)) !== null) {
      const n = Number(String(m[1]).replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) candidates.push(n);
    }
  }
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function normalizeUrl(href: string): string {
  if (href.startsWith("http")) return href;
  return `https://www.lancers.jp${href.startsWith("/") ? "" : "/"}${href}`;
}

/**
 * Lancers search / list: one job per `.p-search-job-media` row (title link + price block).
 * Budget uses `.p-search-job-media__price .p-search-job-media__number` so we do not pick proposal counts
 * (other `.p-search-job-media__number` nodes under e.g. `.p-search-job-media__propose-link`).
 */
export async function scrapeTasksFromPage(page: Page): Promise<ScrapedTask[]> {
  const items = await page.evaluate(() => {
    const rows: {
      workId: string;
      href: string;
      title: string;
      snippet: string;
      budgetDisplayText: string | null;
      budgetMinJpy: number | null;
      budgetMaxJpy: number | null;
    }[] = [];

    const seen = new Set<string>();

    const cards = [...document.querySelectorAll(".p-search-job-media")].filter(
      (card) =>
        !!card.querySelector('a.p-search-job-media__title[href*="/work/detail/"]') ||
        /goToLjpWorkDetail\(\d+\)/.test(card.getAttribute("onclick") ?? ""),
    );

    if (cards.length > 0) {
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        let workId: string | null = null;
        const titleA = card.querySelector(
          'a.p-search-job-media__title[href*="/work/detail/"]',
        ) as HTMLAnchorElement | null;
        const hrefFromTitle = titleA?.getAttribute("href") ?? "";
        const fromHref = /\/work\/detail\/(\d+)/.exec(hrefFromTitle);
        if (fromHref) workId = fromHref[1];
        if (!workId) {
          const onclick = card.getAttribute("onclick") ?? "";
          const fromOnclick = /goToLjpWorkDetail\((\d+)\)/.exec(onclick);
          workId = fromOnclick ? fromOnclick[1] : null;
        }

        if (!workId || seen.has(workId)) continue;
        seen.add(workId);

        const href = titleA?.getAttribute("href") ?? `/work/detail/${workId}`;
        let title = "";
        if (titleA) {
          const titleClone = titleA.cloneNode(true) as HTMLAnchorElement;
          const tagLists = titleClone.querySelectorAll("ul.p-search-job-media__tags");
          for (let t = 0; t < tagLists.length; t++) tagLists[t].remove();
          title = (titleClone.textContent ?? "").trim().replace(/\s+/g, " ");
        }
        const snippet = (card.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 1200);

        const priceEl = card.querySelector(".p-search-job-media__price");
        let budgetDisplayText: string | null = null;
        let budgetMinJpy: number | null = null;
        let budgetMaxJpy: number | null = null;
        if (priceEl) {
          budgetDisplayText = (priceEl.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
          const nums = priceEl.querySelectorAll(".p-search-job-media__number");
          const values: number[] = [];
          for (let k = 0; k < nums.length; k++) {
            const raw = (nums[k].textContent ?? "").replace(/,/g, "").trim();
            const n = Number(raw);
            if (Number.isFinite(n) && n > 0) values.push(n);
          }
          if (values.length > 0) {
            budgetMinJpy = Math.min(...values);
            budgetMaxJpy = Math.max(...values);
          }
        }

        rows.push({
          workId,
          href,
          title: title || snippet.slice(0, 120),
          snippet,
          budgetDisplayText,
          budgetMinJpy,
          budgetMaxJpy,
        });
      }
    } else {
      const anchors = document.querySelectorAll('a[href*="/work/detail/"]');
      for (let j = 0; j < anchors.length; j++) {
        const a = anchors[j] as HTMLAnchorElement;
        const m = /\/work\/detail\/(\d+)/.exec(a.getAttribute("href") ?? "");
        if (!m) continue;
        const workId = m[1];
        if (seen.has(workId)) continue;
        seen.add(workId);

        const titleClone = a.cloneNode(true) as HTMLAnchorElement;
        const tagListsA = titleClone.querySelectorAll("ul.p-search-job-media__tags");
        for (let t = 0; t < tagListsA.length; t++) tagListsA[t].remove();
        const title = (titleClone.textContent ?? "").trim().replace(/\s+/g, " ");

        const card =
          a.closest(".p-search-job-media") ??
          a.closest("article, li, tr, .c-media, .p-cassette, [class*='card'], .media") ??
          a.parentElement?.parentElement;
        const snippet = card
          ? (card.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 1200)
          : (a.parentElement?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 1200);

        let budgetDisplayText: string | null = null;
        let budgetMinJpy: number | null = null;
        let budgetMaxJpy: number | null = null;
        if (card) {
          const priceEl = card.querySelector(".p-search-job-media__price");
          if (priceEl) {
            budgetDisplayText = (priceEl.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim();
            const nums = priceEl.querySelectorAll(".p-search-job-media__number");
            const values: number[] = [];
            for (let k = 0; k < nums.length; k++) {
              const raw = (nums[k].textContent ?? "").replace(/,/g, "").trim();
              const n = Number(raw);
              if (Number.isFinite(n) && n > 0) values.push(n);
            }
            if (values.length > 0) {
              budgetMinJpy = Math.min(...values);
              budgetMaxJpy = Math.max(...values);
            }
          }
        }

        rows.push({
          workId,
          href: a.getAttribute("href") ?? "",
          title: title || snippet.slice(0, 120),
          snippet,
          budgetDisplayText,
          budgetMinJpy,
          budgetMaxJpy,
        });
      }
    }

    return rows;
  });

  return items.map((row) => {
    const url = normalizeUrl(row.href);
    const snippet = row.snippet || row.title;
    let budgetMinJpy = row.budgetMinJpy;
    let budgetMaxJpy = row.budgetMaxJpy;
    let budgetDisplayText = row.budgetDisplayText;

    if (budgetMinJpy == null && budgetMaxJpy == null) {
      const fallback = extractBudgetJpy(snippet);
      if (fallback != null) {
        budgetMinJpy = fallback;
        budgetMaxJpy = fallback;
      }
    }

    let budgetJpy: number | null = budgetMaxJpy ?? budgetMinJpy ?? extractBudgetJpy(snippet);

    return {
      workId: row.workId,
      url,
      title: row.title,
      snippet,
      budgetMinJpy,
      budgetMaxJpy,
      budgetDisplayText,
      budgetJpy,
    };
  });
}
