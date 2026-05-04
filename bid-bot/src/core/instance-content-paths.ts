import fs from "node:fs";
import path from "node:path";

/** `__<id>/config` — proposal prompt, templates, secrets, profile.json (sibling of `__<id>/data`). */
export function instanceConfigDirAbs(repoRoot: string, storageStatePathEnv: string): string {
  const dataDir = path.dirname(path.resolve(repoRoot, storageStatePathEnv));
  return path.join(path.dirname(dataDir), "config");
}

/** Shared repo-level defaults (optional). Workspace-managed; older checkouts used `config/`. */
export const WORKSPACE_SHARED_CONFIG_DIR = "__config";
const OBSOLETE_WORKSPACE_SHARED_CONFIG_DIR = "config";

export function legacyRepoConfigProposalPrompt(repoRoot: string): string {
  return path.join(repoRoot, WORKSPACE_SHARED_CONFIG_DIR, "proposal_prompt.txt");
}

export function obsoleteRepoConfigProposalPrompt(repoRoot: string): string {
  return path.join(repoRoot, OBSOLETE_WORKSPACE_SHARED_CONFIG_DIR, "proposal_prompt.txt");
}

export function legacyRepoConfigTemplate(repoRoot: string, templateNumber: number): string {
  return path.join(repoRoot, WORKSPACE_SHARED_CONFIG_DIR, "proposal_templates", `template-${templateNumber}.txt`);
}

export function obsoleteRepoConfigTemplate(repoRoot: string, templateNumber: number): string {
  return path.join(
    repoRoot,
    OBSOLETE_WORKSPACE_SHARED_CONFIG_DIR,
    "proposal_templates",
    `template-${templateNumber}.txt`,
  );
}

export function legacyRepoConfigJapaneseCorpus(repoRoot: string): string {
  return path.join(repoRoot, WORKSPACE_SHARED_CONFIG_DIR, "native_japanese_sentences.txt");
}

export function obsoleteRepoConfigJapaneseCorpus(repoRoot: string): string {
  return path.join(repoRoot, OBSOLETE_WORKSPACE_SHARED_CONFIG_DIR, "native_japanese_sentences.txt");
}

/** Prefer first path with non-empty trimmed content. */
export function readTextFileFirstExisting(paths: string[]): string {
  for (const p of paths) {
    try {
      const t = fs.readFileSync(p, "utf8").trim();
      if (t.length > 0) return t;
    } catch {
      /* try next */
    }
  }
  return "";
}
