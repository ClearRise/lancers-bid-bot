import type { Page } from "playwright";
import { submitBid } from "../lancers/bid.js";
import { scrapeTaskDetail } from "../lancers/detail.js";
import { notifyBidResult } from "./notify-desktop.js";
import { saveHistory } from "../persistence/store.js";

type HistoryEntry = {
  attemptedAt: string;
  status: string;
  reason?: string;
  stepHistory?: Array<{
    step: string;
    status: "ok" | "skipped" | "failed";
    message?: string;
    at: string;
  }>;
};

type BidHistory = Record<string, HistoryEntry>;

type ExecutorLogger = {
  log: (message: string) => void;
  error: (message: string, err?: unknown) => void;
};

function isValidTaskDetail(detail: { title: string; description: string }): boolean {
  return detail.title.trim().length > 0 && detail.description.trim().length > 0;
}

export async function executeBidForWorkId(params: {
  page: Page;
  workId: string;
  history: BidHistory;
  attemptedIds: Set<string>;
  historyPath: string;
  logger: ExecutorLogger;
  contextLabel: string;
  dashboardUrlIndex?: number | null;
}): Promise<void> {
  const {
    page,
    workId,
    history,
    attemptedIds,
    historyPath,
    logger,
    contextLabel,
    dashboardUrlIndex = null,
  } = params;

  logger.log(`${contextLabel} open_task_link work_id=${workId}`);
  try {
    let detail = await scrapeTaskDetail(page, workId);
    if (!isValidTaskDetail(detail)) {
      logger.log(`${contextLabel} detail_invalid work_id=${workId} retry=1`);
      detail = await scrapeTaskDetail(page, workId);
    }
    if (!isValidTaskDetail(detail)) {
      logger.log(`${contextLabel} cannot submit on this task work_id=${workId}`);
      history[workId] = {
        attemptedAt: new Date().toISOString(),
        status: "failed",
        reason: "invalid_detail",
      };
      attemptedIds.add(workId);
      await saveHistory(historyPath, history);
      return;
    }

    detail = { ...detail, dashboardUrlIndex };
    logger.log(`${contextLabel} detail_loaded work_id=${workId} title="${detail.title.slice(0, 80)}"`);

    const result = await submitBid(page, detail);
    history[workId] = {
      attemptedAt: result.attemptedAt,
      status: result.status,
      reason: result.reason,
      stepHistory: result.stepHistory,
    };
    attemptedIds.add(workId);
    await saveHistory(historyPath, history);
    logger.log(`${contextLabel} bid_result work_id=${workId} status=${result.status}`);

    void notifyBidResult({
      taskUrl: detail.url,
      title: detail.title,
      status: result.status,
      budgetMinJpy: detail.budgetMinJpy,
      budgetMaxJpy: detail.budgetMaxJpy,
      reason: result.reason,
    }).catch((notifyErr) => {
      logger.error(`${contextLabel} bid_notify_failed work_id=${workId}`, notifyErr);
    });
  } catch (err) {
    logger.error(`${contextLabel} bid_failed work_id=${workId}`, err);
    history[workId] = {
      attemptedAt: new Date().toISOString(),
      status: "failed",
      reason: "exception",
    };
    attemptedIds.add(workId);
    await saveHistory(historyPath, history);
    void notifyBidResult({
      taskUrl: `https://www.lancers.jp/work/propose_start/${workId}?proposeReferer=`,
      title: "Unknown task",
      status: "failed",
      budgetMinJpy: null,
      budgetMaxJpy: null,
      reason: "exception",
    }).catch((notifyErr) => {
      logger.error(`${contextLabel} bid_notify_failed work_id=${workId}`, notifyErr);
    });
  }
}
