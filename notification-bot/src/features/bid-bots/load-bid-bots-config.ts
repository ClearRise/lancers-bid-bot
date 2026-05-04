import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { BidBotConfigFileEntry, BidBotNotifyTarget, BidBotsConfigFile } from "./types.js";

/** bid-bot HTTP notify endpoint path (fixed; not configurable per bot). */
const BID_BOT_NOTIFY_PATH = "/notify";
/** Default when `host` is omitted in bid_bots.json (local bid-bots). */
const DEFAULT_BID_BOT_HOST = "127.0.0.1";

const entrySchema = z
  .object({
    id: z.string().min(1),
    notifyUrl: z.string().url().optional(),
    host: z.string().min(1).optional(),
    port: z.coerce.number().int().positive(),
    enabled: z.boolean().optional(),
    notificationDashboardUrls: z.array(z.string().url()).optional(),
    dashboardUrls: z.array(z.string().url()).optional(),
    taskCategoryKeys: z.array(z.string().min(1)).optional(),
  })
  .superRefine((val, ctx) => {
    const n = val.notificationDashboardUrls?.length ?? 0;
    const d = val.dashboardUrls?.length ?? 0;
    const k = val.taskCategoryKeys?.length ?? 0;
    if (n === 0 && d === 0 && k === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Each bid-bot needs taskCategoryKeys (names from settings.json notificationMonitorUrls) and/or notificationDashboardUrls / dashboardUrls",
        path: ["taskCategoryKeys"],
      });
    }
  });

function monitorUrlsForEntry(
  entry: BidBotConfigFileEntry,
  monitorUrlCatalog: Record<string, string>,
): string[] {
  if (entry.notificationDashboardUrls?.length) return entry.notificationDashboardUrls;
  if (entry.dashboardUrls?.length) return entry.dashboardUrls;
  const keys = entry.taskCategoryKeys ?? [];
  const urls: string[] = [];
  for (const key of keys) {
    const url = monitorUrlCatalog[key];
    if (!url) {
      const avail = Object.keys(monitorUrlCatalog);
      throw new Error(
        `bid_bots.json bot "${entry.id}": taskCategoryKeys includes unknown key "${key}". ` +
          `Defined in config/settings.json notificationMonitorUrls: ${avail.length ? avail.join(", ") : "(none)"}`,
      );
    }
    urls.push(url);
  }
  return urls;
}

const fileSchema = z.object({
  bidBots: z.array(entrySchema).min(1),
});

function resolveNotifyUrl(entry: BidBotConfigFileEntry): string {
  if (entry.notifyUrl) return entry.notifyUrl;
  const host = entry.host ?? DEFAULT_BID_BOT_HOST;
  return `http://${host}:${entry.port}${BID_BOT_NOTIFY_PATH}`;
}

function toTarget(entry: BidBotConfigFileEntry): BidBotNotifyTarget {
  return {
    id: entry.id,
    notifyUrl: resolveNotifyUrl(entry),
  };
}

export type LoadedBidBotsRouting = {
  /** Unique notification monitor URLs (worker order); same as `config.dashboardUrls` */
  dashboardUrls: string[];
  /** For each monitor URL index, which bid-bots to notify */
  targetsPerDashboardIndex: BidBotNotifyTarget[][];
  /** All distinct targets (for logging) */
  allTargets: BidBotNotifyTarget[];
};

/**
 * Build dashboard workers and per-dashboard notify routing from bid_bots.json entries.
 */
export function buildRoutingFromBidBotsFile(
  file: BidBotsConfigFile,
  monitorUrlCatalog: Record<string, string>,
): LoadedBidBotsRouting {
  const active = file.bidBots.filter((b) => b.enabled !== false);
  const urlToTargets = new Map<string, BidBotNotifyTarget[]>();
  const seenTargetIds = new Map<string, BidBotNotifyTarget>();

  for (const raw of active) {
    const target = toTarget(raw);
    if (seenTargetIds.has(target.id)) {
      throw new Error(`Duplicate bid-bot id in bid_bots.json: "${target.id}"`);
    }
    seenTargetIds.set(target.id, target);

    let monitorUrls: string[];
    try {
      monitorUrls = monitorUrlsForEntry(raw, monitorUrlCatalog);
    } catch (e) {
      console.error("[bid-bots]", e instanceof Error ? e.message : e);
      process.exit(1);
    }

    for (const url of monitorUrls) {
      const list = urlToTargets.get(url) ?? [];
      if (!list.some((t) => t.id === target.id)) {
        list.push(target);
      }
      urlToTargets.set(url, list);
    }
  }

  const dashboardUrls = [...urlToTargets.keys()];
  const targetsPerDashboardIndex = dashboardUrls.map((u) => urlToTargets.get(u) ?? []);

  return {
    dashboardUrls,
    targetsPerDashboardIndex,
    allTargets: [...seenTargetIds.values()],
  };
}

export function loadBidBotsConfigFromPath(
  absolutePath: string,
  monitorUrlCatalog: Record<string, string>,
): LoadedBidBotsRouting | null {
  let text: string;
  try {
    text = fs.readFileSync(absolutePath, "utf8").trim();
  } catch {
    return null;
  }

  if (!text) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    console.error("[bid-bots] bid_bots.json is not valid JSON:", error);
    process.exit(1);
  }

  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[bid-bots] Invalid bid_bots.json:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return buildRoutingFromBidBotsFile(parsed.data as BidBotsConfigFile, monitorUrlCatalog);
}

/** Resolve path relative to `process.cwd()` (run `npm start` from notification-bot/). */
export function resolveBidBotsConfigPath(configPathFromEnv: string | undefined): string {
  const relative = configPathFromEnv?.trim() || "config/bid_bots.json";
  return path.isAbsolute(relative) ? relative : path.resolve(process.cwd(), relative);
}
