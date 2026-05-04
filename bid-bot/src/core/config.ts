import path from "node:path";
import { z } from "zod";
import { bootstrapInstanceEnvironment, resolvedInstanceId } from "./instance-bootstrap.js";
import {
  instanceConfigDirAbs,
  legacyRepoConfigProposalPrompt,
  obsoleteRepoConfigProposalPrompt,
  readTextFileFirstExisting,
} from "./instance-content-paths.js";

/** Loads shared .env, then `__<id>/config` + `__<id>/data` (parent = `BID_BOT_PROFILES_DIR` or optional __config/instances.json) — instance required */
bootstrapInstanceEnvironment();

const emptyToUndefined = (v: unknown) => (v === "" || v === undefined ? undefined : v);

const schema = z.object({
  LANCERS_DASHBOARD_URL: z.string().url().default("https://www.lancers.jp/work/search"),
  STORAGE_STATE_PATH: z.string().default("./data/lancers-session.json"),
  HEADLESS: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  SEEN_IDS_PATH: z.string().default("./data/bid-history.json"),
  MAX_BIDS_PER_CYCLE: z.coerce.number().int().positive().default(2),
  MIN_BUDGET_JPY: z.preprocess(emptyToUndefined, z.coerce.number().int().nonnegative().optional()),
  MAX_BUDGET_JPY: z.preprocess(emptyToUndefined, z.coerce.number().int().nonnegative().optional()),
  BUDGET_DEFINITION_RATE: z.coerce.number().min(0).default(0.5),
  DRY_RUN: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  BID_BOT_PORT: z.coerce.number().int().positive().default(3000),
  BID_QUEUE_PATH: z.string().default("./data/bid-queue.json"),
  MANUAL_BID_TASK_IDS_PATH: z.string().default("./data/manual-bid-task-ids.txt"),
  ENABLE_MONITOR: z.preprocess(
    (v) => (v === "" || v === undefined ? "false" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  DESKTOP_NOTIFICATION: z.preprocess(
    (v) => (v === "" || v === undefined ? "true" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  WINDOWS_TOAST_APP_ID: z.string().default("Cursor"),
  ENABLE_AI_PROPOSAL: z.preprocess(
    (v) => (v === "" || v === undefined ? "false" : v),
    z.enum(["true", "false"]).transform((x) => x !== "false"),
  ),
  BID_PROPOSAL_MODE: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.enum(["ai", "template"]).optional(),
  ),
  JAPANESE_STUDY_EVERY_N_PROPERTIES: z.coerce.number().int().positive().default(10),
  BID_AI_PROVIDER: z
    .string()
    .optional()
    .transform((s) => (s?.trim().toLowerCase() === "openai" ? ("openai" as const) : ("mistral" as const))),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;

function loadProposalAiPromptTemplate(storageStatePath: string): string {
  const repoRoot = process.cwd();
  const configDir = instanceConfigDirAbs(repoRoot, storageStatePath);
  return readTextFileFirstExisting([
    path.join(configDir, "proposal_prompt.txt"),
    legacyRepoConfigProposalPrompt(repoRoot),
    obsoleteRepoConfigProposalPrompt(repoRoot),
  ]);
}

export const config = {
  /** Same id as notification-bot bid_bots.json entry. */
  instanceId: resolvedInstanceId as string,
  dashboardUrl: e.LANCERS_DASHBOARD_URL,
  storageStatePath: e.STORAGE_STATE_PATH,
  headless: e.HEADLESS,
  pollIntervalMs: e.POLL_INTERVAL_MS,
  seenIdsPath: e.SEEN_IDS_PATH,
  maxBidsPerCycle: e.MAX_BIDS_PER_CYCLE,
  minBudgetJpy: e.MIN_BUDGET_JPY,
  maxBudgetJpy: e.MAX_BUDGET_JPY,
  budgetDefinitionRate: e.BUDGET_DEFINITION_RATE,
  dryRun: e.DRY_RUN,
  bidBotPort: e.BID_BOT_PORT,
  bidQueuePath: e.BID_QUEUE_PATH,
  manualBidTaskIdsPath: e.MANUAL_BID_TASK_IDS_PATH,
  enableMonitor: e.ENABLE_MONITOR,
  desktopNotification: e.DESKTOP_NOTIFICATION,
  windowsToastAppId: e.WINDOWS_TOAST_APP_ID,
  proposalMode: e.BID_PROPOSAL_MODE ?? (e.ENABLE_AI_PROPOSAL ? "ai" : "template"),
  enableAiProposal: e.ENABLE_AI_PROPOSAL,
  japaneseStudyEveryNProperties: e.JAPANESE_STUDY_EVERY_N_PROPERTIES,
  proposalAiPromptTemplate: loadProposalAiPromptTemplate(e.STORAGE_STATE_PATH),
  /** Proposal LLM when `proposalMode` is `ai`: `mistral` or `openai` only. */
  bidAiProvider: e.BID_AI_PROVIDER,
};
