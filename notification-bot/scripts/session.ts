/**
 * Lancers Playwright session: save (browser login) or restore (from backup).
 *
 *   npm run session              → save (default)
 *   npm run session -- save      → save
 *   npm run session -- restore [path|--from path]  → restore
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const loginUrl = process.env.LANCERS_LOGIN_URL ?? "https://www.lancers.jp/user/login";
const storageStatePath = process.env.STORAGE_STATE_PATH ?? "./data/lancers-session.json";

function printHelp(): void {
  console.log(`notification-bot — session
  npm run session              Save login (opens browser; default)
  npm run session -- save      Same as above
  npm run session -- restore   Copy backup → STORAGE_STATE_PATH (see .env.example)
  npm run session -- restore -- ./data/lancers-session.backup.json
  npm run session -- restore -- --from ./backup.json
`);
}

function parseBackupArg(userArgs: string[]): string | null {
  const fromEnv = process.env.RESTORE_SESSION_FROM?.trim();
  if (fromEnv) return fromEnv;

  const fromIdx = userArgs.findIndex((a) => a === "--from" || a === "-f");
  if (fromIdx >= 0 && userArgs[fromIdx + 1] && !userArgs[fromIdx + 1].startsWith("-")) {
    return userArgs[fromIdx + 1];
  }

  for (const a of userArgs) {
    if (a === "--from" || a === "-f") continue;
    if (a.startsWith("-")) continue;
    return a;
  }
  return null;
}

function defaultBackupCandidates(target: string): string[] {
  const dir = path.dirname(target);
  const base = path.basename(target);
  return [
    path.join(dir, `${base}.backup`),
    path.join(dir, `${base}.bak`),
    path.join(process.cwd(), "data", "lancers-session.backup.json"),
  ];
}

function pickExistingBackup(target: string, explicit: string | null): string {
  if (explicit) {
    const abs = path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
    if (!fs.existsSync(abs)) {
      console.error(`[session] Backup not found: ${abs}`);
      process.exit(1);
    }
    return abs;
  }

  for (const p of defaultBackupCandidates(target)) {
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    if (fs.existsSync(abs)) return abs;
  }

  console.error("[session] restore: no backup file specified or found.");
  console.error("  npm run session -- restore -- ./data/lancers-session.backup.json");
  console.error("  Or set RESTORE_SESSION_FROM in .env");
  console.error(`  Defaults checked: ${defaultBackupCandidates(target).join(", ")}`);
  process.exit(1);
}

function runRestore(userArgs: string[]): void {
  const targetRel = process.env.STORAGE_STATE_PATH ?? "./data/lancers-session.json";
  const target = path.resolve(process.cwd(), targetRel);
  const explicit = parseBackupArg(userArgs);
  const source = pickExistingBackup(target, explicit);

  let raw: string;
  try {
    raw = fs.readFileSync(source, "utf8");
  } catch (e) {
    console.error(`[session] Cannot read backup: ${source}`, e);
    process.exit(1);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      (!("cookies" in (parsed as object)) && !("origins" in (parsed as object)))
    ) {
      console.warn("[session] Backup JSON may not be Playwright storage state (expected cookies or origins).");
    }
  } catch {
    console.error(`[session] Backup is not valid JSON: ${source}`);
    process.exit(1);
  }

  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const pre = path.join(dir, `${path.basename(target)}.pre-restore-${stamp}`);
    fs.copyFileSync(target, pre);
    console.log(`[session] Previous session copied to: ${path.relative(process.cwd(), pre)}`);
  }

  fs.copyFileSync(source, target);
  console.log(
    `[session] Restored ${path.relative(process.cwd(), target)} from ${path.relative(process.cwd(), source)}`,
  );
}

async function runSave(): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  const rl = readline.createInterface({ input, output });
  await rl.question(
    "After you finish logging in in the browser, press Enter here to save session... ",
  );
  rl.close();

  await mkdir(path.dirname(storageStatePath), { recursive: true });
  await context.storageState({ path: storageStatePath });
  console.log(`[session] Saved: ${storageStatePath}`);
  await browser.close();
}

function parseArgv(argv: string[]): { cmd: "save" | "restore"; restoreArgs: string[] } {
  if (argv.length === 0) return { cmd: "save", restoreArgs: [] };
  const first = argv[0].toLowerCase();
  if (first === "-h" || first === "--help" || first === "help") {
    printHelp();
    process.exit(0);
  }
  if (first === "save") return { cmd: "save", restoreArgs: [] };
  if (first === "restore") return { cmd: "restore", restoreArgs: argv.slice(1) };
  console.error(`[session] Unknown command: ${argv[0]}`);
  console.error("  Use: save | restore  (or npm run session with no args to save)");
  printHelp();
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { cmd, restoreArgs } = parseArgv(argv);
  if (cmd === "restore") {
    runRestore(restoreArgs);
    return;
  }
  await runSave();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
