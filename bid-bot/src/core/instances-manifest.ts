import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Parent directory for profile folders under the bid-bot repo.
 * Each profile lives in `__<id>/config` + `__<id>/data` (logical id is still `buno`, folder is `__buno`).
 * `"."` → next to `package.json`. Use `"./profiles"` to nest under `profiles/`.
 */
export const DEFAULT_PROFILES_DIR = ".";

/** Windows `.bat` shortcuts (tooling; `__` = workspace-managed). */
export const LAUNCHERS_DIR_NAME = "__launchers";

const LEGACY_LAUNCHERS_DIR_NAME = "launchers";
const OBSOLETE_INSTANCES_DIR_NAME = "instances";

/** Optional slim manifest: `{ "profilesDir": "..." }` (tooling). */
export const WORKSPACE_MANIFEST_DIR_NAME = "__config";

/** Profile root directory name: `__` + logical id (strip redundant leading `__` from id). */
export function profileDirectoryName(instanceId: string): string {
  const slug = instanceId.replace(/^__+/, "") || instanceId;
  return `__${slug}`;
}

function isReservedUnderProfilesParent(name: string): boolean {
  return (
    name === LAUNCHERS_DIR_NAME ||
    name === WORKSPACE_MANIFEST_DIR_NAME ||
    name === "node_modules" ||
    name === "src" ||
    name === "scripts" ||
    name === "dist"
  );
}

/** One-time: `buno/` → `__buno/` when `config/profile.json` exists. */
export function migrateUnprefixedProfileFolders(repoRoot: string, profilesDir: string): void {
  const root = resolveProfilesParentAbs(repoRoot, profilesDir);
  if (!fs.existsSync(root)) return;
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    const name = ent.name;
    if (isReservedUnderProfilesParent(name)) continue;
    if (name.startsWith("__")) continue;
    const profilePath = path.join(root, name, "config", "profile.json");
    if (!fs.existsSync(profilePath)) continue;
    const destName = profileDirectoryName(name);
    const destAbs = path.join(root, destName);
    if (fs.existsSync(destAbs)) {
      console.warn(`[bid-bot] skip profile rename ${name}/ → ${destName}/ (target exists)`);
      continue;
    }
    fs.renameSync(path.join(root, name), destAbs);
    console.warn(`[bid-bot] renamed profile folder ${name}/ → ${destName}/`);
  }
}

/** One-time: `instances/` or `launchers/` → `__launchers/`. */
export function migrateLauncherScriptsDirIfNeeded(repoRoot: string): void {
  const target = path.join(repoRoot, LAUNCHERS_DIR_NAME);
  if (fs.existsSync(target)) return;
  const mid = path.join(repoRoot, LEGACY_LAUNCHERS_DIR_NAME);
  const old = path.join(repoRoot, OBSOLETE_INSTANCES_DIR_NAME);
  if (fs.existsSync(mid)) {
    fs.renameSync(mid, target);
    console.warn(`[bid-bot] renamed ${LEGACY_LAUNCHERS_DIR_NAME}/ → ${LAUNCHERS_DIR_NAME}/`);
    return;
  }
  if (fs.existsSync(old)) {
    fs.renameSync(old, target);
    console.warn(`[bid-bot] renamed ${OBSOLETE_INSTANCES_DIR_NAME}/ → ${LAUNCHERS_DIR_NAME}/`);
  }
}

/** One-time: `config/instances.json` → `__config/instances.json`. */
function migrateLegacyWorkspaceManifestDirIfNeeded(repoRoot: string): void {
  const newDir = path.join(repoRoot, WORKSPACE_MANIFEST_DIR_NAME);
  const newFile = path.join(newDir, "instances.json");
  const oldFile = path.join(repoRoot, "config", "instances.json");
  if (!fs.existsSync(oldFile) || fs.existsSync(newFile)) return;
  fs.mkdirSync(newDir, { recursive: true });
  fs.renameSync(oldFile, newFile);
  console.warn(`[bid-bot] moved config/instances.json → ${WORKSPACE_MANIFEST_DIR_NAME}/instances.json`);
  tryRemoveEmptyDir(path.join(repoRoot, "config"));
}

function tryRemoveEmptyDir(dir: string): void {
  try {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
    }
  } catch {
    /* ignore */
  }
}

/** `__launchers` + `__config/instances.json` migrations; run before any manifest read/write. */
function prepareWorkspaceToolingPaths(repoRoot: string): void {
  migrateLauncherScriptsDirIfNeeded(repoRoot);
  migrateLegacyWorkspaceManifestDirIfNeeded(repoRoot);
}

/** Legacy flat secrets next to launcher scripts (`__launchers/<id>.env`). */
export function getLegacyLaunchersDotEnvPath(repoRoot: string, instanceId: string): string {
  return path.join(repoRoot, LAUNCHERS_DIR_NAME, `${instanceId}.env`);
}

/** Pre-rename paths; still read if present. */
export function getObsoleteInstancesDotEnvPath(repoRoot: string, instanceId: string): string {
  return path.join(repoRoot, OBSOLETE_INSTANCES_DIR_NAME, `${instanceId}.env`);
}

export function getLegacyUnprefixedLaunchersDotEnvPath(repoRoot: string, instanceId: string): string {
  return path.join(repoRoot, LEGACY_LAUNCHERS_DIR_NAME, `${instanceId}.env`);
}

/** Merge order: weaker paths first, then caller appends `secrets.env` last so it wins. */
export function legacyFlatEnvPathsInMergeOrder(repoRoot: string, instanceId: string): string[] {
  return [
    getObsoleteInstancesDotEnvPath(repoRoot, instanceId),
    getLegacyUnprefixedLaunchersDotEnvPath(repoRoot, instanceId),
    getLegacyLaunchersDotEnvPath(repoRoot, instanceId),
  ];
}

/** JSON keys (kebab / snake) → canonical camelCase for schema */
const INSTANCE_KEY_ALIASES: Record<string, string> = {
  "enable-ai-proposal": "enableAiProposal",
  "budget_definition_rate": "budgetDefinitionRate",
  "windows-toast-app-id": "windowsToastAppId",
  "enable-monitor": "enableMonitor",
  "max-bids-per-cycle": "maxBidsPerCycle",
  "poll-interval-ms": "pollIntervalMs",
  "dry-run": "dryRun",
  "desktop-notification": "desktopNotification",
  "japanese-study-every-n-properties": "japaneseStudyEveryNProperties",
  "min-budget-jpy": "minBudgetJpy",
  "max-budget-jpy": "maxBudgetJpy",
  "static-estimate-text": "staticEstimateText",
};

function normalizeInstanceKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = INSTANCE_KEY_ALIASES[k] ?? k;
    out[key] = v;
  }
  return out;
}

export const instanceEntrySchema = z.object({
  id: z.string().min(1),
  port: z.coerce.number().int().positive(),
  windowsToastAppId: z.string().optional(),
  enableAiProposal: z.boolean().optional(),
  headless: z.boolean().optional(),
  budgetDefinitionRate: z.coerce.number().min(0).max(1).optional(),
  enableMonitor: z.boolean().optional(),
  maxBidsPerCycle: z.coerce.number().int().positive().optional(),
  pollIntervalMs: z.coerce.number().int().positive().optional(),
  dryRun: z.boolean().optional(),
  desktopNotification: z.boolean().optional(),
  japaneseStudyEveryNProperties: z.coerce.number().int().positive().optional(),
  minBudgetJpy: z.union([z.coerce.number().int().nonnegative(), z.null()]).optional(),
  maxBudgetJpy: z.union([z.coerce.number().int().nonnegative(), z.null()]).optional(),
  staticEstimateText: z.string().optional(),
});

export type InstanceManifestEntry = z.infer<typeof instanceEntrySchema>;
export type InstancesManifest = { profilesDir: string; instances: InstanceManifestEntry[] };

export function getManifestPath(repoRoot: string): string {
  return path.join(repoRoot, WORKSPACE_MANIFEST_DIR_NAME, "instances.json");
}

export function parseInstanceIdFromArgv(argv: string[]): string | null {
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--instance" && argv[i + 1]) {
      const v = argv[i + 1].trim();
      if (v) return v;
    }
    if (a.startsWith("--instance=")) {
      const v = a.slice("--instance=".length).trim();
      if (v) return v;
    }
  }
  return null;
}

/** Resolve the filesystem directory that contains profile folders (`<id>/`). */
export function resolveProfilesParentAbs(repoRoot: string, profilesDir: string): string {
  const p = profilesDir.trim().replace(/\/+$/, "");
  if (p === "." || p === "./") return repoRoot;
  return path.join(repoRoot, p.replace(/^\.\//, ""));
}

/** Paths relative to repo: `__<id>/config` and `__<id>/data` (or `profiles/__<id>/...`). */
export function normalizeProfilePaths(
  profilesDir: string,
  instanceId: string,
): {
  profileRootRelative: string;
  configDirRelative: string;
  dataDirRelative: string;
  storageState: string;
  seenIds: string;
  queue: string;
  manualIds: string;
} {
  const parent = profilesDir.replace(/\/+$/, "").replace(/^\.\//, "");
  const seg = profileDirectoryName(instanceId);
  const base = parent === "." || parent === "" ? `./${seg}` : `./${parent}/${seg}`;
  return {
    profileRootRelative: base,
    configDirRelative: `${base}/config`,
    dataDirRelative: `${base}/data`,
    storageState: `${base}/data/lancers-session.json`,
    seenIds: `${base}/data/bid-history.json`,
    queue: `${base}/data/bid-queue.json`,
    manualIds: `${base}/data/manual-bid-task-ids.txt`,
  };
}

/** @deprecated use normalizeProfilePaths */
export function normalizeDataPaths(profilesDir: string, instanceId: string) {
  const p = normalizeProfilePaths(profilesDir, instanceId);
  return {
    storageState: p.storageState,
    seenIds: p.seenIds,
    queue: p.queue,
    manualIds: p.manualIds,
    dataDirRelative: p.dataDirRelative,
  };
}

function resolveUnderRepo(repoRoot: string, dotRelative: string): string {
  const rel = dotRelative.replace(/^\.\//, "");
  return path.join(repoRoot, rel);
}

function profileConfigDirAbs(repoRoot: string, profilesDir: string, instanceId: string): string {
  return resolveUnderRepo(repoRoot, normalizeProfilePaths(profilesDir, instanceId).configDirRelative);
}

function profileDataDirAbs(repoRoot: string, profilesDir: string, instanceId: string): string {
  return resolveUnderRepo(repoRoot, normalizeProfilePaths(profilesDir, instanceId).dataDirRelative);
}

/** Per-profile API keys / overrides (under `__<id>/config/secrets.env`). */
export function getSecretsAbsPath(repoRoot: string, profilesDir: string, instanceId: string): string {
  return path.join(profileConfigDirAbs(repoRoot, profilesDir, instanceId), "secrets.env");
}

export function saveProfileEntry(repoRoot: string, profilesDir: string, entry: InstanceManifestEntry): void {
  const configAbs = profileConfigDirAbs(repoRoot, profilesDir, entry.id);
  fs.mkdirSync(configAbs, { recursive: true });
  const profilePath = path.join(configAbs, "profile.json");
  fs.writeFileSync(profilePath, JSON.stringify(entry, null, 2) + "\n", "utf8");
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** Split `data/instances/<id>/*` (flat) → `__<id>/config` + `__<id>/data`. */
function migrateFlatDataInstanceToProfiles(repoRoot: string, instanceId: string, oldAbs: string): void {
  if (!fs.existsSync(oldAbs)) return;
  const configAbs = profileConfigDirAbs(repoRoot, DEFAULT_PROFILES_DIR, instanceId);
  const dataAbs = profileDataDirAbs(repoRoot, DEFAULT_PROFILES_DIR, instanceId);
  fs.mkdirSync(configAbs, { recursive: true });
  fs.mkdirSync(dataAbs, { recursive: true });

  const toData = new Set([
    "lancers-session.json",
    "bid-history.json",
    "bid-queue.json",
    "manual-bid-task-ids.txt",
  ]);
  const toConfig = new Set([
    "profile.json",
    "secrets.env",
    "proposal_prompt.txt",
    "native_japanese_sentences.txt",
  ]);

  for (const ent of fs.readdirSync(oldAbs, { withFileTypes: true })) {
    const name = ent.name;
    const src = path.join(oldAbs, name);
    if (name === "proposal_templates" && ent.isDirectory()) {
      const destPt = path.join(configAbs, "proposal_templates");
      if (!fs.existsSync(destPt)) copyDirRecursive(src, destPt);
      fs.rmSync(src, { recursive: true });
    } else if (ent.isFile()) {
      const destDir = toData.has(name) ? dataAbs : toConfig.has(name) ? configAbs : configAbs;
      const dest = path.join(destDir, name);
      if (!fs.existsSync(dest)) fs.renameSync(src, dest);
      else fs.unlinkSync(src);
    }
  }
  try {
    fs.rmSync(oldAbs, { recursive: true });
  } catch {
    /* ignore */
  }
}

/** Migrate tree `data/instances/*` when manifest still used old `dataRoot: "./data"`. */
export function migrateDataInstancesTreeToProfiles(repoRoot: string): void {
  const oldRoot = path.join(repoRoot, "data", "instances");
  if (!fs.existsSync(oldRoot)) return;
  for (const ent of fs.readdirSync(oldRoot, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    migrateFlatDataInstanceToProfiles(repoRoot, ent.name, path.join(oldRoot, ent.name));
  }
  try {
    fs.rmSync(oldRoot, { recursive: true });
  } catch {
    /* ignore */
  }
  try {
    const dataDir = path.join(repoRoot, "data");
    if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length === 0) {
      fs.rmdirSync(dataDir);
    }
  } catch {
    /* ignore */
  }
}

export function discoverInstanceEntries(repoRoot: string, profilesDir: string): InstanceManifestEntry[] {
  migrateUnprefixedProfileFolders(repoRoot, profilesDir);
  const root = resolveProfilesParentAbs(repoRoot, profilesDir);
  if (!fs.existsSync(root)) return [];

  const names = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !isReservedUnderProfilesParent(d.name))
    .map((d) => d.name);

  const out: InstanceManifestEntry[] = [];
  for (const name of names) {
    const profilePath = path.join(root, name, "config", "profile.json");
    if (!fs.existsSync(profilePath)) continue;
    const logicalId = name.startsWith("__") ? name.slice(2) : name;
    if (!logicalId) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(profilePath, "utf8")) as Record<string, unknown>;
      let entry = instanceEntrySchema.parse(normalizeInstanceKeys(raw));
      if (entry.id !== logicalId) {
        entry = { ...entry, id: logicalId };
        saveProfileEntry(repoRoot, profilesDir, entry);
      }
      out.push(entry);
    } catch (e) {
      console.warn(`[instances] skip invalid profile ${profilePath}:`, e);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function saveSlimManifest(repoRoot: string, profilesDir: string): void {
  const manifestPath = getManifestPath(repoRoot);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ profilesDir }, null, 2) + "\n", "utf8");
}

function tryRemoveEmptyConfigDir(repoRoot: string): void {
  tryRemoveEmptyDir(path.join(repoRoot, WORKSPACE_MANIFEST_DIR_NAME));
}

function unlinkManifest(repoRoot: string): void {
  try {
    const manifestPath = getManifestPath(repoRoot);
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
      tryRemoveEmptyConfigDir(repoRoot);
    }
  } catch {
    /* ignore */
  }
}

function readRawManifest(repoRoot: string): { profilesDir?: string; dataRoot?: string; instances?: unknown[] } {
  const manifestPath = getManifestPath(repoRoot);
  if (!fs.existsSync(manifestPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return z
      .object({
        profilesDir: z.string().optional(),
        dataRoot: z.string().optional(),
        instances: z.array(z.unknown()).optional(),
      })
      .parse(raw);
  } catch {
    return {};
  }
}

export function readProfilesDir(repoRoot: string): string {
  const fromEnv = process.env.BID_BOT_PROFILES_DIR?.trim();
  if (fromEnv) return fromEnv;

  const raw = readRawManifest(repoRoot);
  if (raw.profilesDir?.trim()) return raw.profilesDir.trim();

  if (raw.dataRoot !== undefined) {
    const dr = raw.dataRoot.replace(/^\.\//, "").replace(/\/+$/, "");
    if (dr === "data") {
      if (fs.existsSync(path.join(repoRoot, "data", "instances"))) {
        migrateDataInstancesTreeToProfiles(repoRoot);
      }
      unlinkManifest(repoRoot);
      return DEFAULT_PROFILES_DIR;
    }
  }

  return DEFAULT_PROFILES_DIR;
}

/** @deprecated use readProfilesDir */
export function readDataRoot(repoRoot: string): string {
  return readProfilesDir(repoRoot);
}

/** One-time: `instances: [...]` in __config/instances.json (legacy: config/instances.json) → profile.json per profile; slim manifest. */
export function migrateLegacyManifestIfNeeded(repoRoot: string): void {
  prepareWorkspaceToolingPaths(repoRoot);
  const manifestPath = getManifestPath(repoRoot);
  if (!fs.existsSync(manifestPath)) return;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return;
  }
  const parsed = z
    .object({
      profilesDir: z.string().optional(),
      dataRoot: z.string().optional(),
      instances: z.array(z.unknown()).optional(),
    })
    .parse(raw);
  const legacy = parsed.instances ?? [];
  if (legacy.length === 0) return;

  const savedIds = new Set<string>();
  for (const item of legacy) {
    const r = instanceEntrySchema.safeParse(normalizeInstanceKeys(item as Record<string, unknown>));
    if (r.success) {
      saveProfileEntry(repoRoot, DEFAULT_PROFILES_DIR, r.data);
      savedIds.add(r.data.id);
    }
  }
  if (savedIds.size === 0) return;

  for (const id of savedIds) {
    const newEnv = getSecretsAbsPath(repoRoot, DEFAULT_PROFILES_DIR, id);
    if (fs.existsSync(newEnv)) continue;
    const legacyEnv = [
      getLegacyLaunchersDotEnvPath(repoRoot, id),
      getLegacyUnprefixedLaunchersDotEnvPath(repoRoot, id),
      getObsoleteInstancesDotEnvPath(repoRoot, id),
    ].find((p) => fs.existsSync(p));
    if (legacyEnv) {
      fs.mkdirSync(path.dirname(newEnv), { recursive: true });
      fs.copyFileSync(legacyEnv, newEnv);
    }
  }

  migrateDataInstancesTreeToProfiles(repoRoot);
  unlinkManifest(repoRoot);
}

export function loadManifest(repoRoot: string): InstancesManifest {
  migrateLegacyManifestIfNeeded(repoRoot);
  if (fs.existsSync(path.join(repoRoot, "data", "instances"))) {
    migrateDataInstancesTreeToProfiles(repoRoot);
  }
  const profilesDir = readProfilesDir(repoRoot);
  return { profilesDir, instances: discoverInstanceEntries(repoRoot, profilesDir) };
}

export function saveManifest(repoRoot: string, manifest: InstancesManifest): void {
  saveSlimManifest(repoRoot, manifest.profilesDir);
}

export function upsertInstance(repoRoot: string, entry: InstanceManifestEntry): InstancesManifest {
  migrateLegacyManifestIfNeeded(repoRoot);
  const profilesDir = readProfilesDir(repoRoot);
  migrateUnprefixedProfileFolders(repoRoot, profilesDir);
  saveProfileEntry(repoRoot, profilesDir, entry);
  return { profilesDir, instances: discoverInstanceEntries(repoRoot, profilesDir) };
}

export function getInstanceEntry(manifest: InstancesManifest, id: string): InstanceManifestEntry | undefined {
  return manifest.instances.find((x) => x.id === id);
}
