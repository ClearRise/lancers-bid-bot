import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  loadBidBotsConfigFromPath,
  resolveBidBotsConfigPath,
} from "../features/bid-bots/load-bid-bots-config.js";

const emptyToUndef = (v: unknown) =>
  v === "" || v === undefined ? undefined : v;

function normalizeMonitorUrlCatalog(parsed: unknown, sourceLabel: string): Record<string, string> {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error(
      `[config] ${sourceLabel} must be a JSON object: {\"key\":\"https://...\", ...}`,
    );
    process.exit(1);
  }
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(parsed)) {
    if (typeof val !== "string" || !key.trim()) continue;
    const u = val.trim();
    try {
      new URL(u);
    } catch {
      console.error(`[config] ${sourceLabel}: invalid URL for key "${key}"`);
      process.exit(1);
    }
    out[key.trim()] = u;
  }
  return out;
}

const envSchema = z.object({
  BID_BOTS_CONFIG_PATH: z.preprocess(emptyToUndef, z.string().optional()),
  STORAGE_STATE_PATH: z.string().default("./data/lancers-session.json"),
  COOKIES_PATH: z.preprocess(emptyToUndef, z.string().optional()),
  REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  HEADLESS: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  SEEN_IDS_DIR: z.string().default("./data/seen-work-ids"),
  BOOTSTRAP_SILENT: z.preprocess(
    (v) => v === "true",
    z.boolean().optional(),
  ),
  OPENAI_API_KEY: z.preprocess(emptyToUndef, z.string().optional()),
  DESKTOP_NOTIFICATION: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  WINDOWS_TOAST_APP_ID: z.string().default("Cursor"),
  SESSION_STATUS_CHECK_ENABLED: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  SESSION_STATUS_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(600_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;

const filterSettingsSchema = z.object({
  /** Short names → Lancers poll URLs (used with bid_bots.json taskCategoryKeys). */
  notificationMonitorUrls: z.record(z.string(), z.string()).optional(),
  /** Keyword lists for filters + AI prompt placeholders {{INCLUDE_KEYWORDS}} / {{EXCLUDE_KEYWORDS}}. */
  includeKeywords: z.array(z.string()).optional(),
  excludeKeywords: z.array(z.string()).optional(),
  /** AI filter prompt; must contain {{TITLE}}, {{SNIPPET}}, {{INCLUDE_KEYWORDS}}, {{EXCLUDE_KEYWORDS}}. */
  aiPromptTemplate: z.string().optional(),
  minBudgetJpy: z.number().int().nonnegative().nullable().optional(),
  maxBudgetJpy: z.number().int().nonnegative().nullable().optional(),
  skipIfBudgetUnknown: z.boolean().optional(),
  keywordFilter: z
    .object({
      enabled: z.boolean().optional(),
    })
    .optional(),
  aiFilter: z
    .object({
      enabled: z.boolean().optional(),
      model: z.string().min(1).optional(),
      maxSnippetChars: z.number().int().positive().optional(),
    })
    .optional(),
});

function resolveFromSrc(relativePathFromSrc: string): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  return path.resolve(currentDir, relativePathFromSrc);
}

function loadAppSettings(): {
  filterSettings: z.infer<typeof filterSettingsSchema>;
  monitorUrlCatalog: Record<string, string>;
} {
  const settingsPath = resolveFromSrc("../../config/settings.json");
  let parsedJson: unknown = {};

  try {
    const raw = fs.readFileSync(settingsPath, "utf8").trim();
    parsedJson = raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn(
      `[config] Failed to load settings from ${settingsPath}, using defaults:`,
      error,
    );
  }

  const settingsParsed = filterSettingsSchema.safeParse(parsedJson);
  if (!settingsParsed.success) {
    console.error(
      "Invalid config/settings.json:",
      settingsParsed.error.flatten().fieldErrors,
    );
    process.exit(1);
  }

  const data = settingsParsed.data;
  const urlsRaw = data.notificationMonitorUrls;
  const monitorUrlCatalog =
    urlsRaw && Object.keys(urlsRaw).length > 0
      ? normalizeMonitorUrlCatalog(urlsRaw, "config/settings.json (notificationMonitorUrls)")
      : {};

  return { filterSettings: data, monitorUrlCatalog };
}

const { filterSettings, monitorUrlCatalog } = loadAppSettings();
const bidBotsConfigPath = resolveBidBotsConfigPath(e.BID_BOTS_CONFIG_PATH);
const routingFromFile = loadBidBotsConfigFromPath(bidBotsConfigPath, monitorUrlCatalog);

if (!routingFromFile) {
  console.error(
    `[config] Missing or empty bid_bots.json at ${bidBotsConfigPath}. Set bid-bot entries and taskCategoryKeys (or URLs) there.`,
  );
  process.exit(1);
}

const dashboardUrls = routingFromFile.dashboardUrls;
const bidBotTargetsPerDashboardIndex = routingFromFile.targetsPerDashboardIndex;

if (dashboardUrls.length === 0) {
  console.error(
    "[config] No notification monitor URLs: add notificationMonitorUrls to config/settings.json and taskCategoryKeys in bid_bots.json, or set notificationDashboardUrls per bid-bot.",
  );
  process.exit(1);
}

const catalogKeys = Object.keys(monitorUrlCatalog);
console.log(
  `[config] bid_bots.json: notification_monitors=${dashboardUrls.length} bid_bots=${routingFromFile.allTargets.length} settings_notificationMonitorUrls=${catalogKeys.length ? catalogKeys.join(",") : "(inline urls only)"}`,
);

export const config = {
  dashboardUrl: dashboardUrls[0],
  dashboardUrls,
  bidBotsConfigPath,
  bidBotTargetsPerDashboardIndex,
  /** Keys → Lancers poll URLs from config/settings.json notificationMonitorUrls */
  monitorUrlCatalog,
  storageStatePath: e.STORAGE_STATE_PATH,
  cookiesPath: e.COOKIES_PATH,
  refreshIntervalMs: e.REFRESH_INTERVAL_MS,
  minBudgetJpy: filterSettings.minBudgetJpy ?? undefined,
  maxBudgetJpy: filterSettings.maxBudgetJpy ?? undefined,
  skipIfBudgetUnknown: filterSettings.skipIfBudgetUnknown ?? false,
  headless: e.HEADLESS,
  seenIdsDir: path.isAbsolute(e.SEEN_IDS_DIR)
    ? e.SEEN_IDS_DIR
    : path.resolve(process.cwd(), e.SEEN_IDS_DIR),
  bootstrapSilent: e.BOOTSTRAP_SILENT ?? true,
  includeKeywords: filterSettings.includeKeywords ?? [],
  excludeKeywords: filterSettings.excludeKeywords ?? [],
  keywordFilterEnabled: filterSettings.keywordFilter?.enabled ?? true,
  aiFilterEnabled: filterSettings.aiFilter?.enabled ?? true,
  aiModel: filterSettings.aiFilter?.model ?? "gpt-4o-mini",
  aiMaxSnippetChars: filterSettings.aiFilter?.maxSnippetChars ?? 1200,
  aiPromptTemplate: filterSettings.aiPromptTemplate ?? "",
  openaiApiKey: e.OPENAI_API_KEY,
  desktopNotification: e.DESKTOP_NOTIFICATION,
  windowsToastAppId: e.WINDOWS_TOAST_APP_ID,
  sessionStatusCheckEnabled: e.SESSION_STATUS_CHECK_ENABLED,
  sessionStatusCheckIntervalMs: e.SESSION_STATUS_CHECK_INTERVAL_MS,
};

export type { BidBotNotifyTarget } from "../features/bid-bots/types.js";
