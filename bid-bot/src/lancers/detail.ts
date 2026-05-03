import type { Page } from "playwright";
import { selectors } from "./selectors.js";
import type { TaskDetail } from "../core/types.js";

function toTaskUrl(workId: string): string {
  return `https://www.lancers.jp/work/propose_start/${workId}?proposeReferer=`;
}

export async function scrapeTaskDetail(page: Page, workId: string): Promise<TaskDetail> {
  const url = toTaskUrl(workId);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const detail = await page.evaluate((s) => {
    const title = (document.querySelector(s.detailTitle)?.textContent ?? "")
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\s+/g, " ");

    const descriptionWhole = document.getElementById("workDesctiptionWhole");
    const descriptionFallback = document.querySelector(s.detailDescription);
    const description = (descriptionWhole?.textContent ?? descriptionFallback?.textContent ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const priceNodes = Array.from(document.querySelectorAll(".price-number"));
    const numbers: number[] = [];
    for (const node of priceNodes) {
      const raw = (node.textContent ?? "").replace(/,/g, "");
      const m = raw.match(/\d+/);
      if (!m) continue;
      const n = Number(m[0]);
      if (Number.isFinite(n)) numbers.push(n);
    }
    const budgetMinJpy = numbers.length > 0 ? Math.min(...numbers) : null;
    const budgetMaxJpy = numbers.length > 0 ? Math.max(...numbers) : null;

    const budgetTextNode = document.querySelector(s.detailBudget);
    const budgetText = (budgetTextNode?.textContent ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    let clientName: string | null = null;
    const clientInfoDefinitionList = document.querySelector("dl.c-definition-list");
    if (clientInfoDefinitionList) {
      const ddNodes = Array.from(clientInfoDefinitionList.querySelectorAll("dd"));
      if (ddNodes.length >= 2) {
        const normalizedClientText = (ddNodes[1]?.textContent ?? "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (normalizedClientText) {
          const clientParts = normalizedClientText
            .split("/")
            .map((part) => part.trim())
            .filter(Boolean);
          if (clientParts.length >= 2) {
            // Prefer display name when available: "id / name"
            clientName = clientParts[1] || clientParts[0] || null;
          } else {
            clientName = clientParts[0] || null;
          }
        }
      }
    }

    let deadline: string | null = null;
    const definitionLists = Array.from(document.querySelectorAll("dl.c-definition-list"));
    const detailRoot = definitionLists.length > 0 ? definitionLists[definitionLists.length - 1] : null;
    if (detailRoot) {
      const ddNodes = Array.from(detailRoot.querySelectorAll("dd"));
      if (ddNodes.length >= 2) {
        deadline =
          (ddNodes[ddNodes.length - 2].textContent ?? "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim() || null;
      }
    }

    return { title, description, clientName, budgetText, budgetMinJpy, budgetMaxJpy, deadline };
  }, selectors);

  return {
    workId,
    url,
    title: detail.title,
    description: detail.description,
    clientName: detail.clientName,
    budgetText: detail.budgetText || null,
    budgetMinJpy: detail.budgetMinJpy,
    budgetMaxJpy: detail.budgetMaxJpy,
    deadline: detail.deadline,
  };
}
