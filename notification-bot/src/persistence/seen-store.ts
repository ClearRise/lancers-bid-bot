import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Safe filename for `data/seen-work-ids/<name>.json` */
export function seenIdsFileNameForBot(botId: string): string {
  const safe = botId.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "") || "bot";
  return `${safe}.json`;
}

/**
 * One-time migration: legacy single-file `seen-work-ids.json` → one file per bid-bot id.
 * Runs only when the legacy file exists and no per-bot file exists yet under `seenIdsDir`.
 */
export async function migrateLegacySeenWorkIdsFile(options: {
  seenIdsDir: string;
  legacyFilePath: string;
  botIds: string[];
}): Promise<void> {
  const { seenIdsDir, legacyFilePath, botIds } = options;
  if (botIds.length === 0 || !existsSync(legacyFilePath)) return;

  const anyPerBotFile = botIds.some((id) =>
    existsSync(join(seenIdsDir, seenIdsFileNameForBot(id))),
  );
  if (anyPerBotFile) return;

  const legacy = await loadSeenIds(legacyFilePath);
  if (legacy.size === 0) return;

  await mkdir(seenIdsDir, { recursive: true });
  for (const id of botIds) {
    await saveSeenIds(join(seenIdsDir, seenIdsFileNameForBot(id)), new Set(legacy));
  }
  console.log(
    `[seen-store] migrated ${legacy.size} id(s) from ${legacyFilePath} → ${botIds.length} file(s) under ${seenIdsDir}`,
  );
}

export async function loadSeenIds(path: string): Promise<Set<string>> {
  if (!existsSync(path)) return new Set();
  try {
    const raw = await readFile(path, "utf8");
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export async function saveSeenIds(path: string, ids: Set<string>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify([...ids], null, 0) + "\n", "utf8");
}
