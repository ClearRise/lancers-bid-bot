import { config } from "../core/config.js";
import { openContext } from "../core/browser.js";
import { loadHistory } from "../persistence/store.js";
import { takeQueuedTasks } from "../persistence/queue-store.js";
import { error, log } from "../core/logger.js";
import { studyNativeJapanese } from "../proposals/japanese-study.js";
import { executeBidForWorkId } from "./bid-executor.js";

export type MonitorWorker = {
  trigger: () => void;
};

export async function startMonitorWorker(signal: AbortSignal): Promise<MonitorWorker> {
  const history = await loadHistory(config.seenIdsPath);
  const attemptedIds = new Set(Object.keys(history));
  const { browser, context, page } = await openContext();
  log("monitor", `startup dry_run=${config.dryRun} history=${attemptedIds.size}`);
  let cycle = 0;
  let isProcessing = false;
  let pendingTrigger = false;
  let processedPropertyCount = 0;

  const closeBrowser = async () => {
    await context.close();
    await browser.close();
    log("monitor", "shutdown complete");
  };

  signal.addEventListener(
    "abort",
    () => {
      void closeBrowser();
    },
    { once: true },
  );

  const openDashboardWhileIdle = async (): Promise<void> => {
    try {
      await page.goto(config.dashboardUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      log("monitor", "idle dashboard opened");
    } catch (err) {
      error("monitor", "failed to open idle dashboard", err);
    }
  };

  const processQueue = async (): Promise<void> => {
    if (isProcessing) {
      pendingTrigger = true;
      return;
    }

    isProcessing = true;
    try {
      do {
        // const TEST_WORK_ID = "5530547";
        // const detail = await scrapeTaskDetail(page, TEST_WORK_ID);
        // console.log("\n##############-scraped task details-###############\n");
        // console.log(detail);
        // console.log("\n##########################################\n");

        // const result = await submitBid(page, detail);
        // console.log("\n##############-bid result-###############\n");
        // console.log(result);
        // console.log("\n##########################################\n");
        pendingTrigger = false;
        cycle += 1;
        log("monitor", `cycle=${cycle} start`);

        const queued = await takeQueuedTasks(config.bidQueuePath, config.maxBidsPerCycle);
        if (queued.queueSize > 0) {
          // Continue draining queue in this run even without a new API trigger.
          pendingTrigger = true;
        }
        const tasks = queued.tasks.filter((task) => !attemptedIds.has(task.workId));
        log(
          "monitor",
          `cycle=${cycle} dequeued=${queued.tasks.length} candidates=${tasks.length} remaining_queue=${queued.queueSize}`,
        );

        if (tasks.length === 0) {
          if (queued.queueSize > 0) {
            // Next batch still exists; skip idle dashboard and continue immediately.
            continue;
          }
          await openDashboardWhileIdle();
          break;
        }

        for (const queuedTask of tasks) {
          const { workId, dashboardUrlIndex } = queuedTask;
          processedPropertyCount += 1;
          // const studyEvery = config.japaneseStudyEveryNProperties;
          // if (studyEvery > 0 && processedPropertyCount % studyEvery === 0) {
          //   void studyNativeJapanese(`auto-monitor-${processedPropertyCount}`).catch((err) => {
          //     error(
          //       "monitor",
          //       `study-japanese failed property_count=${processedPropertyCount}`,
          //       err,
          //     );
          //   });
          // }
          await executeBidForWorkId({
            page,
            workId,
            history,
            attemptedIds,
            historyPath: config.seenIdsPath,
            dashboardUrlIndex,
            contextLabel: `cycle=${cycle}`,
            logger: {
              log: (message) => log("monitor", message),
              error: (message, err) => error("monitor", message, err),
            },
          });
        }

        await openDashboardWhileIdle();
      } while (pendingTrigger && !signal.aborted);
    } finally {
      isProcessing = false;
    }
  };

  // Process any existing queued items on startup.
  void processQueue();

  return {
    trigger: () => {
      void processQueue();
    },
  };
}
