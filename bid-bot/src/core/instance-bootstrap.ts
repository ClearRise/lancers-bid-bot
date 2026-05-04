import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { ensureBidBotWorkspace, ensureInstanceDataPlaceholders } from "./ensure-workspace.js";
import {
  getLegacyLaunchersDotEnvPath,
  getLegacyUnprefixedLaunchersDotEnvPath,
  getObsoleteInstancesDotEnvPath,
  getSecretsAbsPath,
  loadManifest,
  normalizeDataPaths,
  normalizeProfilePaths,
  parseInstanceIdFromArgv,
  type InstanceManifestEntry,
} from "./instances-manifest.js";

/** Set by bootstrap; always set in instance-only mode. */
export let resolvedInstanceId: string | null = null;

function parseInstanceId(): string | null {
  return (
    parseInstanceIdFromArgv(process.argv) ||
    process.env.BID_BOT_INSTANCE?.trim() ||
    process.env.BID_BOT_PROFILE?.trim() ||
    null
  );
}

function applyBooleanEnv(key: string, value: boolean | undefined): void {
  if (value !== undefined) process.env[key] = value ? "true" : "false";
}

function applyNumberEnv(key: string, value: number | undefined): void {
  if (value !== undefined && !Number.isNaN(value)) process.env[key] = String(value);
}

/** Map profile.json fields → process.env (overrides shared repo `.env`). */
function applyInstanceRuntimeFields(entry: InstanceManifestEntry): void {
  applyBooleanEnv("ENABLE_AI_PROPOSAL", entry.enableAiProposal);
  applyBooleanEnv("HEADLESS", entry.headless);
  applyNumberEnv("BUDGET_DEFINITION_RATE", entry.budgetDefinitionRate);

  applyBooleanEnv("ENABLE_MONITOR", entry.enableMonitor);
  applyNumberEnv("MAX_BIDS_PER_CYCLE", entry.maxBidsPerCycle);
  applyNumberEnv("POLL_INTERVAL_MS", entry.pollIntervalMs);
  applyBooleanEnv("DRY_RUN", entry.dryRun);
  applyBooleanEnv("DESKTOP_NOTIFICATION", entry.desktopNotification);
  applyNumberEnv("JAPANESE_STUDY_EVERY_N_PROPERTIES", entry.japaneseStudyEveryNProperties);

  if (entry.minBudgetJpy !== undefined && entry.minBudgetJpy !== null) {
    process.env.MIN_BUDGET_JPY = String(entry.minBudgetJpy);
  }
  if (entry.maxBudgetJpy !== undefined && entry.maxBudgetJpy !== null) {
    process.env.MAX_BUDGET_JPY = String(entry.maxBudgetJpy);
  }
}

/**
 * Instance-only: loads repo `.env` (shared API keys), requires BID_BOT_INSTANCE / `--instance`,
 * applies `__<id>/config` (profile.json, secrets.env, prompts) + `__<id>/data` (session, queues) under bid-bot by default.
 */
export function bootstrapInstanceEnvironment(repoRoot: string = process.cwd()): void {
  const workspaceCreated = ensureBidBotWorkspace(repoRoot);
  if (workspaceCreated.length) {
    console.log(`[workspace] created: ${workspaceCreated.join(", ")}`);
  }

  dotenv.config({ path: path.join(repoRoot, ".env") });

  const id = parseInstanceId();
  if (!id) {
    console.error(
      "[config] bid-bot runs per instance only. Set BID_BOT_INSTANCE=<id> or use: npm start -- --instance <id>",
    );
    console.error("[config] Windows: run __launchers\\<id>.bat  |  First time: npm run session:save -- --instance <id>");
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) || id.includes("..")) {
    console.error(
      `[config] Instance id must be a safe name (letters, numbers, ._-). Got: ${JSON.stringify(id)}`,
    );
    process.exit(1);
  }

  const manifest = loadManifest(repoRoot);
  const entry = manifest.instances.find((x) => x.id === id);
  if (!entry) {
    const known = manifest.instances.map((x) => x.id).join(", ") || "(none)";
    console.error(`[config] Unknown instance id "${id}". Known profiles: ${known}`);
    const expectRel = normalizeProfilePaths(manifest.profilesDir, id).configDirRelative.replace(/^\.\//, "");
    console.error(
      `[config] Expected ${expectRel}/profile.json — run: npm run session:save -- --instance ${id}`,
    );
    process.exit(1);
  }

  const paths = normalizeDataPaths(manifest.profilesDir, id);
  process.env.STORAGE_STATE_PATH = paths.storageState;
  process.env.SEEN_IDS_PATH = paths.seenIds;
  process.env.BID_QUEUE_PATH = paths.queue;
  process.env.MANUAL_BID_TASK_IDS_PATH = paths.manualIds;
  process.env.BID_BOT_PORT = String(entry.port);

  if (entry.windowsToastAppId) {
    process.env.WINDOWS_TOAST_APP_ID = entry.windowsToastAppId;
  } else if (!process.env.WINDOWS_TOAST_APP_ID?.trim()) {
    process.env.WINDOWS_TOAST_APP_ID = `Cursor - ${id}`;
  }

  applyInstanceRuntimeFields(entry);

  const dataCreated = ensureInstanceDataPlaceholders(repoRoot, manifest.profilesDir, id);
  if (dataCreated.length) {
    console.log(`[workspace] created: ${dataCreated.join(", ")}`);
  }

  const secretsPath = getSecretsAbsPath(repoRoot, manifest.profilesDir, id);
  const legacyLaunchersEnv = getLegacyLaunchersDotEnvPath(repoRoot, id);
  const midLaunchersEnv = getLegacyUnprefixedLaunchersDotEnvPath(repoRoot, id);
  const obsoleteInstancesEnv = getObsoleteInstancesDotEnvPath(repoRoot, id);
  if (fs.existsSync(secretsPath)) {
    dotenv.config({ path: secretsPath, override: true });
  } else if (fs.existsSync(legacyLaunchersEnv)) {
    dotenv.config({ path: legacyLaunchersEnv, override: true });
  } else if (fs.existsSync(midLaunchersEnv)) {
    dotenv.config({ path: midLaunchersEnv, override: true });
  } else if (fs.existsSync(obsoleteInstancesEnv)) {
    dotenv.config({ path: obsoleteInstancesEnv, override: true });
  }

  resolvedInstanceId = id;
  const sessionAbs = path.resolve(repoRoot, paths.storageState.replace(/^\.\//, ""));
  const profileRootAbs = path.dirname(path.dirname(sessionAbs));
  const rootRel = path.relative(repoRoot, profileRootAbs).replace(/\\/g, "/");
  console.log(`[config] instance=${id} port=${entry.port} profile=${rootRel}/`);
}
