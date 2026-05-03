import path from "node:path";
import { config } from "../core/config.js";
import { createBrowserContext } from "../core/browser.js";
import { scrapeTasksFromPage } from "../features/scraping/extract-tasks.js";
import { isTaskSuitable } from "../features/filtering/filters.js";
import type { ScrapedTask } from "../core/types.js";
import {
  loadSeenIds,
  migrateLegacySeenWorkIdsFile,
  saveSeenIds,
  seenIdsFileNameForBot,
} from "../persistence/seen-store.js";
import { notifyBidBotsForDashboard } from "../features/notify/notify-bid-bots.js";

type QueuedTask = {
  task: ScrapedTask;
  dashboardUrlIndex: number;
};

export async function runMonitorLoop(signal: AbortSignal): Promise<void> {
  const allBidBotIds = [
    ...new Set(config.bidBotTargetsPerDashboardIndex.flatMap((row) => row.map((t) => t.id))),
  ];

  await migrateLegacySeenWorkIdsFile({
    seenIdsDir: config.seenIdsDir,
    legacyFilePath: path.resolve(process.cwd(), "data/seen-work-ids.json"),
    botIds: allBidBotIds,
  });

  const seenByBot = new Map<string, Set<string>>();
  for (const id of allBidBotIds) {
    seenByBot.set(
      id,
      await loadSeenIds(path.join(config.seenIdsDir, seenIdsFileNameForBot(id))),
    );
  }

  const anyPriorSeenAcrossAllBots = [...seenByBot.values()].some((s) => s.size > 0);
  let processCount = 0;
  let saveLock: Promise<void> = Promise.resolve();
  const taskQueue: QueuedTask[] = [];
  let queueWaiter: (() => void) | null = null;
  const workerBootstrapDone = config.dashboardUrls.map(
    () => anyPriorSeenAcrossAllBots || !config.bootstrapSilent,
  );

  const enqueueTask = (task: ScrapedTask, dashboardUrlIndex: number) => {
    taskQueue.push({ task, dashboardUrlIndex });
    if (queueWaiter) {
      const resolve = queueWaiter;
      queueWaiter = null;
      resolve();
    }
  };

  const waitForTask = async (): Promise<void> => {
    if (taskQueue.length > 0) return;
    await new Promise<void>((resolve) => {
      queueWaiter = resolve;
      signal.addEventListener(
        "abort",
        () => {
          if (queueWaiter) {
            const done = queueWaiter;
            queueWaiter = null;
            done();
          }
        },
        { once: true },
      );
    });
  };

  const withSeenLock = async (fn: () => Promise<void>) => {
    saveLock = saveLock.then(fn, fn);
    await saveLock;
  };

  const markSeenForBots = async (workId: string, botIds: string[]) => {
    if (botIds.length === 0) return;
    await withSeenLock(async () => {
      for (const id of botIds) {
        const set = seenByBot.get(id);
        if (!set) continue;
        if (set.has(workId)) continue;
        set.add(workId);
        await saveSeenIds(path.join(config.seenIdsDir, seenIdsFileNameForBot(id)), set);
      }
    });
  };

  const seenSummary = allBidBotIds.map((id) => `${id}=${seenByBot.get(id)?.size ?? 0}`).join(", ");
  console.log(`[monitor] startup: seen-work-ids per bot (${config.seenIdsDir}): ${seenSummary}`);
  console.log(`[monitor] startup: notification_monitor_urls=${config.dashboardUrls.length}`);
  console.log(`[monitor] startup: refresh_interval_ms=${config.refreshIntervalMs}`);
  if (!(anyPriorSeenAcrossAllBots || !config.bootstrapSilent)) {
    console.log("[monitor] startup: bootstrap_silent enabled, first cycle stores ids only");
  }

  const { browser, context } = await createBrowserContext();

  try {
    const workers = config.dashboardUrls.map((url, workerIndex) => (async () => {
      const page = await context.newPage();
      let cycle = 0;
      while (!signal.aborted) {
        cycle += 1;
        try {
          console.log(`[monitor][worker ${workerIndex + 1}][cycle ${cycle}] refreshing dashboard-${workerIndex + 1}`);
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await new Promise((r) => setTimeout(r, 800));
          const tasks = await scrapeTasksFromPage(page);
          console.log(`[monitor][worker ${workerIndex + 1}][cycle ${cycle}] scraped=${tasks.length}`);

          if (!workerBootstrapDone[workerIndex]) {
            const botIds = (config.bidBotTargetsPerDashboardIndex[workerIndex] ?? []).map((t) => t.id);
            for (const task of tasks) {
              await markSeenForBots(task.workId, botIds);
            }
            workerBootstrapDone[workerIndex] = true;
            console.log(`[monitor][worker ${workerIndex + 1}][cycle ${cycle}] bootstrap_complete`);
          } else {
            for (const task of tasks) {
              enqueueTask(task, workerIndex);
            }
          }
        } catch (err) {
          console.error(`[monitor][worker ${workerIndex + 1}][cycle ${cycle}] failed`, err);
        }

        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, config.refreshIntervalMs);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true },
          );
        });
      }
      await page.close();
    })());

    const processor = (async () => {
      while (!signal.aborted) {
        await waitForTask();
        const queuedTask = taskQueue.shift();
        if (!queuedTask) continue;
        const { task, dashboardUrlIndex } = queuedTask;
        processCount += 1;
        const targets = config.bidBotTargetsPerDashboardIndex[dashboardUrlIndex] ?? [];
        const botIds = targets.map((t) => t.id);
        if (
          botIds.length > 0 &&
          botIds.every((id) => seenByBot.get(id)?.has(task.workId))
        ) {
          continue;
        }

        console.log(`[monitor][process ${processCount}][task ${task.workId}] evaluate title="${task.title.slice(0, 80)}"`);
        if (!(await isTaskSuitable(task))) {
          console.log(`[monitor][process ${processCount}][task ${task.workId}] result=not_matched`);
          await markSeenForBots(task.workId, botIds);
          continue;
        }

        console.log(`[monitor][process ${processCount}][task ${task.workId}] result=matched`);
        const targetsToNotify = targets.filter((t) => !seenByBot.get(t.id)?.has(task.workId));
        if (targetsToNotify.length === 0) continue;

        try {
          console.log(`[monitor][process ${processCount}][task ${task.workId}] notifying bid bot(s)`);
          const succeeded = await notifyBidBotsForDashboard(
            task,
            dashboardUrlIndex,
            targetsToNotify,
          );
          await markSeenForBots(task.workId, succeeded);
          console.log(`[monitor][process ${processCount}][task ${task.workId}] notify=done ok=${succeeded.join(",")}`);
        } catch (err) {
          console.error(`[monitor][process ${processCount}][task ${task.workId}] notify=failed`, err);
        }
      }
    })();

    await Promise.all([...workers, processor]);
  } finally {
    console.log("[monitor] shutdown: closing browser context");
    await context.close();
    await browser.close();
    console.log("[monitor] shutdown: done");
  }
}
