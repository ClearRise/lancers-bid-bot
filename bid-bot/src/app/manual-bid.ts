import fs from "node:fs/promises";
import { config } from "../core/config.js";
import { openContext } from "../core/browser.js";
import { executeBidForWorkId } from "./bid-executor.js";
import { loadHistory } from "../persistence/store.js";
import { error, log } from "../core/logger.js";
import {
  LOGGED_OUT_DESKTOP_MESSAGE,
  startLancersSessionStatusTrackingWithDesktopNotify,
} from "@japan-auto/lancers-session";

const DEFAULT_MANUAL_DELAY_MS = 0;

function parseTaskIds(raw: string): string[] {
  const ids = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split(/\s+/)[0] ?? "")
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function randomDelayMs(minMs: number, maxMs: number): number {
  const range = maxMs - minMs + 1;
  return minMs + Math.floor(Math.random() * range);
}

function isValidWorkId(workId: string): boolean {
  return /^\d{5,}$/.test(workId);
}

function normalizeToWorkId(raw: string): string {
  const input = raw.trim();
  const urlMatch = input.match(/\/work\/(?:detail|propose_start)\/(\d+)/);
  if (urlMatch?.[1]) return urlMatch[1];
  const idMatch = input.match(/\b(\d{5,})\b/);
  if (idMatch?.[1]) return idMatch[1];
  return input;
}

function parseDelayMs(): number {
  const raw = process.env.MANUAL_BID_DELAY_MS?.trim();
  if (!raw) return DEFAULT_MANUAL_DELAY_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`invalid MANUAL_BID_DELAY_MS: "${raw}" (expected non-negative integer)`);
  }
  return parsed;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const delayMs = parseDelayMs();
  const taskIdsPath = config.manualBidTaskIdsPath;
  const fileRaw = await fs.readFile(taskIdsPath, "utf8");
  const fileWorkIds = parseTaskIds(fileRaw).map(normalizeToWorkId);

  const history = await loadHistory(config.seenIdsPath);
  const invalidIds = fileWorkIds.filter((id) => !isValidWorkId(id));
  if (invalidIds.length > 0) {
    throw new Error(
      `invalid work id(s) in ${taskIdsPath}: ${invalidIds.join(", ")} (expected numeric task id or task url)`,
    );
  }

  if (fileWorkIds.length === 0) {
    log(
      "manual",
      `no task IDs found in ${taskIdsPath}`,
    );
    return;
  }

  const controller = new AbortController();
  const onSig = () => controller.abort();
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  const attemptedIds = new Set(Object.keys(history));
  const { browser, context, page } = await openContext();

  const sessionTracker = startLancersSessionStatusTrackingWithDesktopNotify({
    context,
    signal: controller.signal,
    enabled: config.sessionStatusCheckEnabled,
    intervalMs: config.sessionStatusCheckIntervalMs,
    desktopNotification: config.desktopNotification,
    windowsToastAppId: config.windowsToastAppId,
    logPrefix: "[session]",
  });
  log(
    "manual",
    `loaded manual ids count=${fileWorkIds.length} path=${taskIdsPath}`,
  );
  log("manual", `delay_between_bids=${delayMs}ms dry_run=${config.dryRun}`);

  let submittedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    for (const [index, workId] of fileWorkIds.entries()) {
      if (sessionTracker.isLoggedOut()) {
        log("manual", `stopped: ${LOGGED_OUT_DESKTOP_MESSAGE}`);
        break;
      }
      const previousStatus = history[workId]?.status ?? null;
      await executeBidForWorkId({
        page,
        workId,
        history,
        attemptedIds,
        historyPath: config.seenIdsPath,
        dashboardUrlIndex: null,
        contextLabel: `manual=${index + 1}/${fileWorkIds.length}`,
        logger: {
          log: (message) => log("manual", message),
          error: (message, err) => error("manual", message, err),
        },
      });
      const status = history[workId]?.status;
      if (status === "submitted") submittedCount += 1;
      else if (status === "skipped") skippedCount += 1;
      else if (status === "failed") failedCount += 1;
      if (status && status === previousStatus) {
        log(
          "manual",
          `manual=${index + 1}/${fileWorkIds.length} status_unchanged work_id=${workId} status=${status}`,
        );
      }

      const isLast = index === fileWorkIds.length - 1;
      if (!isLast && delayMs > 0) {
        const sleepMs = randomDelayMs(delayMs, delayMs);
        const delaySec = Math.round(sleepMs / 1000);
        log("manual", `waiting delay before next bid: ${delaySec}s`);
        await sleep(sleepMs);
      }
    }
  } finally {
    controller.abort();
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
    const total = fileWorkIds.length;
    const known = submittedCount + skippedCount + failedCount;
    const unknownCount = Math.max(total - known, 0);
    log(
      "manual",
      `completed total=${total} submitted=${submittedCount} skipped=${skippedCount} failed=${failedCount} unknown=${unknownCount}`,
    );
    await context.close();
    await browser.close();
    log("manual", "shutdown complete");
  }
}

main().catch((err) => {
  error("manual", "fatal", err);
  process.exit(1);
});
