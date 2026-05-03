import type { BidBotNotifyTarget } from "../bid-bots/types.js";
import type { ScrapedTask } from "../../core/types.js";

async function postToBidBot(
  task: ScrapedTask,
  dashboardUrlIndex: number,
  target: BidBotNotifyTarget,
): Promise<void> {
  const body = {
    source: "lancers-notification-bot",
    bidBotId: target.id,
    workId: task.workId,
    dashboardUrlIndex,
    url: task.url,
    title: task.title,
    snippet: task.snippet,
    budgetJpy: task.budgetJpy,
    budgetMinJpy: task.budgetMinJpy,
    budgetMaxJpy: task.budgetMaxJpy,
    budgetDisplayText: task.budgetDisplayText,
    notifiedAt: new Date().toISOString(),
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  const res = await fetch(target.notifyUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bid bot "${target.id}" responded ${res.status}: ${text.slice(0, 500)}`);
  }
}

/**
 * Notify every bid-bot in `targets`. Returns ids that returned HTTP OK (failed bots are logged).
 */
export async function notifyBidBotsForDashboard(
  task: ScrapedTask,
  dashboardUrlIndex: number,
  targets: BidBotNotifyTarget[],
): Promise<string[]> {
  if (targets.length === 0) {
    console.log("[notify] no bid-bot targets for this dashboard; printing payload only");
    console.log(JSON.stringify({ task, dashboardUrlIndex }, null, 2));
    return [];
  }

  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        await postToBidBot(task, dashboardUrlIndex, target);
        return target.id;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[notify] bid-bot id=${target.id} work_id=${task.workId}: ${message}`);
        return null;
      }
    }),
  );

  return results.filter((id): id is string => id != null);
}
