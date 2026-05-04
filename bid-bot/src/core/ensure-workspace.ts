import fs from "node:fs";
import path from "node:path";
import { normalizeProfilePaths } from "./instances-manifest.js";

/** template-1 → system (index 0), template-2 → web (index 1). */
const PROPOSAL_TEMPLATE_COUNT = 2;

function resolveUnderRepo(repoRoot: string, dotRelative: string): string {
  return path.join(repoRoot, dotRelative.replace(/^\.\//, ""));
}

function writeIfMissing(repoRoot: string, abs: string, content: string, created: string[]): void {
  if (fs.existsSync(abs)) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  created.push(path.relative(repoRoot, abs).replace(/\\/g, "/"));
}

/**
 * Repo-level: `.env` only (from `.env.example` if present).
 * Profile layout uses `__<id>/config` + `__<id>/data` (see `BID_BOT_PROFILES_DIR` or optional `__config/instances.json`).
 */
export function ensureBidBotWorkspace(repoRoot: string): string[] {
  const created: string[] = [];

  const envPath = path.join(repoRoot, ".env");
  const examplePath = path.join(repoRoot, ".env.example");
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
    } else {
      fs.writeFileSync(
        envPath,
        "# Add API keys. Optional: copy from .env.example when you add one.\nLANCERS_DASHBOARD_URL=https://www.lancers.jp/work/search\n",
        "utf8",
      );
    }
    created.push(".env");
  }

  return created;
}

/** Empty runtime files under `__<id>/data` and `__<id>/config`. */
export function ensureInstanceDataPlaceholders(
  repoRoot: string,
  profilesDir: string,
  instanceId: string,
): string[] {
  const created: string[] = [];
  const paths = normalizeProfilePaths(profilesDir, instanceId);
  const dataAbs = resolveUnderRepo(repoRoot, paths.dataDirRelative);
  const configAbs = resolveUnderRepo(repoRoot, paths.configDirRelative);

  writeIfMissing(repoRoot, path.join(dataAbs, "bid-queue.json"), "[]\n", created);
  writeIfMissing(repoRoot, path.join(dataAbs, "bid-history.json"), "{}\n", created);
  writeIfMissing(repoRoot, path.join(dataAbs, "manual-bid-task-ids.txt"), "", created);

  writeIfMissing(repoRoot, path.join(configAbs, "proposal_prompt.txt"), "", created);
  writeIfMissing(repoRoot, path.join(configAbs, "native_japanese_sentences.txt"), "", created);
  for (let i = 1; i <= PROPOSAL_TEMPLATE_COUNT; i++) {
    writeIfMissing(repoRoot, path.join(configAbs, "proposal_templates", `template-${i}.txt`), "", created);
  }

  return created;
}
