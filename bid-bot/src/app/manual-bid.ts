import fs from "node:fs/promises";
import { config } from "../core/config.js";
import { openContext } from "../core/browser.js";
import { executeBidForWorkId } from "./bid-executor.js";
import { loadHistory } from "../persistence/store.js";
import { error, log } from "../core/logger.js";

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

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const raw = await fs.readFile(config.manualBidTaskIdsPath, "utf8");
  const workIds = parseTaskIds(raw);
  if (workIds.length === 0) {
    log("manual", `no task IDs found in ${config.manualBidTaskIdsPath}`);
    return;
  }

  const history = await loadHistory(config.seenIdsPath);
  const attemptedIds = new Set(Object.keys(history));
  const { browser, context, page } = await openContext();
  log("manual", `loaded ${workIds.length} manual work id(s) from ${config.manualBidTaskIdsPath}`);

  try {
    for (const [index, workId] of workIds.entries()) {
      await executeBidForWorkId({
        page,
        workId,
        history,
        attemptedIds,
        historyPath: config.seenIdsPath,
        dashboardUrlIndex: null,
        contextLabel: `manual=${index + 1}/${workIds.length}`,
        logger: {
          log: (message) => log("manual", message),
          error: (message, err) => error("manual", message, err),
        },
      });

      const isLast = index === workIds.length - 1;
      if (!isLast) {
        const delayMs = randomDelayMs(60_000, 300_000);
        const delaySec = Math.round(delayMs / 1000);
        log("manual", `waiting random delay before next bid: ${delaySec}s`);
        await sleep(delayMs);
      }
    }
  } finally {
    await context.close();
    await browser.close();
    log("manual", "shutdown complete");
  }
}

main().catch((err) => {
  error("manual", "fatal", err);
  process.exit(1);
});
