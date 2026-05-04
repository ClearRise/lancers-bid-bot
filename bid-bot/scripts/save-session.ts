import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import type { Interface as ReadlinePromisesInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { ensureBidBotWorkspace, ensureInstanceDataPlaceholders } from "../src/core/ensure-workspace.js";
import {
  getInstanceEntry,
  LAUNCHERS_DIR_NAME,
  loadManifest,
  normalizeProfilePaths,
  parseInstanceIdFromArgv,
  profileDirectoryName,
  upsertInstance,
  type InstanceManifestEntry,
} from "../src/core/instances-manifest.js";

function section(title: string): void {
  const line = "-".repeat(Math.max(44, title.length + 8));
  console.log(`\n${line}\n  ${title}\n${line}`);
}

function ynLabel(v: boolean | undefined): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "unset (falls back to shared .env when the bot runs)";
}

function printProfileSummary(id: string, profilesDir: string, e: InstanceManifestEntry): void {
  const rel = `${normalizeProfilePaths(profilesDir, id).configDirRelative.replace(/^\.\//, "")}/profile.json`;
  console.log(`\nCurrent settings for "${id}" (${rel}):`);
  console.log(`  HTTP port              ${e.port}`);
  console.log(`  Windows toast app id   ${e.windowsToastAppId ?? `Cursor - ${id}`}`);
  console.log(`  AI proposal text       ${ynLabel(e.enableAiProposal)}`);
  console.log(`  Headless browser       ${ynLabel(e.headless)}`);
  console.log(`  Budget definition rate ${e.budgetDefinitionRate ?? 0.5}`);
}

function validateInstanceId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) && !id.includes("..");
}

/** CLI: `--update-profile` / `--profile-only` — edit profile.json and exit (no browser). */
function parseUpdateProfileOnlyArgv(argv: string[]): boolean {
  return argv.includes("--update-profile") || argv.includes("--profile-only");
}

function ensureDataDir(repoRoot: string, profilesDir: string, id: string): void {
  const paths = normalizeProfilePaths(profilesDir, id);
  const profileRoot = path.join(repoRoot, paths.profileRootRelative.replace(/^\.\//, ""));
  fs.mkdirSync(path.join(profileRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(profileRoot, "data"), { recursive: true });
  console.log(
    `[session:save] profile folder: ${path.relative(repoRoot, profileRoot).replace(/\\/g, "/")}/ (config/ + data/)`,
  );
  const dataCreated = ensureInstanceDataPlaceholders(repoRoot, profilesDir, id);
  for (const p of dataCreated) {
    console.log(`[session:save] created ${p}`);
  }
}

/** Windows launcher: `__launchers/<id>.bat` (folder + file). Skips overwrite if the .bat already exists. */
function ensureInstanceLauncherBat(repoRoot: string, id: string): void {
  const dir = path.join(repoRoot, LAUNCHERS_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  const batPath = path.join(dir, `${id}.bat`);
  if (fs.existsSync(batPath)) return;

  const nl = "\r\n";
  const body = [
    "@echo off",
    'cd /d "%~dp0\\.."',
    `set BID_BOT_INSTANCE=${id}`,
    `title Lancers Bid Bot — ${id}`,
    `echo  Instance: ${id} — ${profileDirectoryName(id)}\\config + ${profileDirectoryName(id)}\\data`,
    `echo  Refresh login: npm run session:save -- --instance ${id}`,
    "echo.",
    "npm start",
    "pause",
    "",
  ].join(nl);
  fs.writeFileSync(batPath, body, "utf8");
  console.log(`[session:save] wrote ${path.relative(repoRoot, batPath).replace(/\\/g, "/")}`);
}

function printBidBotsReminder(entry: InstanceManifestEntry): void {
  console.log("\n[session:save] notification-bot: add or update config/bid_bots.json with the same id and port, e.g.");
  console.log(
    JSON.stringify(
      {
        id: entry.id,
        port: entry.port,
        taskCategoryKeys: ["system", "web"],
      },
      null,
      2,
    ),
  );
}

async function promptProfileId(rl: ReadlinePromisesInterface, repoRoot: string): Promise<string> {
  const manifest = loadManifest(repoRoot);
  section("Which profile?");
  if (manifest.instances.length === 0) {
    console.log(
      `No profiles yet — you will create the first one under ${manifest.profilesDir.replace(/^\.\//, "")}/__<id>/config + .../data.`,
    );
    const id = (await rl.question("\nProfile id: ")).trim();
    return id;
  }

  console.log("\nPick a profile (or create a new one):\n");
  manifest.instances.forEach((x, i) => {
    console.log(`  [${i + 1}]  ${x.id}     port ${x.port}`);
  });
  console.log(`  [${manifest.instances.length + 1}]  Create new profile`);
  const choice = (await rl.question("\nEnter number: ")).trim();
  const n = parseInt(choice, 10);
  if (n === manifest.instances.length + 1) {
    return (await rl.question("New profile id: ")).trim();
  }
  if (Number.isInteger(n) && n >= 1 && n <= manifest.instances.length) {
    return manifest.instances[n - 1].id;
  }
  console.error("Invalid choice.");
  process.exit(1);
}

async function configureProfile(
  rl: ReadlinePromisesInterface,
  repoRoot: string,
  id: string,
  existing: InstanceManifestEntry | undefined,
): Promise<InstanceManifestEntry> {
  const mode = existing ? "Update settings" : "New profile";
  section(`${mode} — ${id}`);
  console.log("Answer each question (Enter keeps the value in [brackets]).\n");

  const portDefault = existing?.port ?? 3000;
  const portStr = (await rl.question(`HTTP port [${portDefault}]: `)).trim();
  const port = portStr ? parseInt(portStr, 10) : portDefault;
  if (!Number.isInteger(port) || port <= 0) {
    console.error("Invalid port.");
    process.exit(1);
  }

  const toastDefault = existing?.windowsToastAppId || `Cursor - ${id}`;
  const toastIn = (await rl.question(`Windows toast app id [${toastDefault}]: `)).trim();
  const windowsToastAppId = toastIn || toastDefault;

  const aiDef = existing?.enableAiProposal ?? false;
  const aiAns = (await rl.question(`Use AI for proposal text? (y/N) [${aiDef ? "y" : "n"}]: `))
    .trim()
    .toLowerCase();
  const enableAiProposal = aiAns === "y" ? true : aiAns === "n" ? false : aiDef;

  const hlDef = existing?.headless ?? false;
  const hlAns = (await rl.question(`Run browser headless when bidding? (y/N) [${hlDef ? "y" : "n"}]: `))
    .trim()
    .toLowerCase();
  const headless = hlAns === "y" ? true : hlAns === "n" ? false : hlDef;

  const rateDef = existing?.budgetDefinitionRate ?? 0.5;
  const rateStr = (await rl.question(`Budget definition rate, 0 to 1 [${rateDef}]: `)).trim();
  const budgetDefinitionRate = rateStr ? parseFloat(rateStr) : rateDef;
  if (Number.isNaN(budgetDefinitionRate) || budgetDefinitionRate < 0 || budgetDefinitionRate > 1) {
    console.error("Invalid rate.");
    process.exit(1);
  }

  const entry: InstanceManifestEntry = {
    ...(existing ?? {}),
    id,
    port,
    windowsToastAppId,
    enableAiProposal,
    headless,
    budgetDefinitionRate,
  };
  upsertInstance(repoRoot, entry);

  const manifest = loadManifest(repoRoot);
  ensureDataDir(repoRoot, manifest.profilesDir, id);
  ensureInstanceLauncherBat(repoRoot, id);

  return entry;
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const rl = readline.createInterface({ input, output });
  const updateProfileOnly = parseUpdateProfileOnlyArgv(process.argv);

  section(
    updateProfileOnly
      ? "Bid-bot — update profile (no browser)"
      : "Bid-bot — save Lancers login session",
  );
  const workspaceCreated = ensureBidBotWorkspace(repoRoot);
  if (workspaceCreated.length) {
    console.log(`Created: ${workspaceCreated.join(", ")}`);
    console.log(
      "(Edit proposal_prompt.txt, proposal_templates/template-1.txt + template-2.txt (system + web), native_japanese_sentences.txt under each __<id>/config when you are ready.)\n",
    );
  }
  console.log("You can pass --instance <id> on the command line, or pick a profile below.\n");

  let id = parseInstanceIdFromArgv(process.argv);
  if (!id) {
    id = await promptProfileId(rl, repoRoot);
  }

  if (!id || !validateInstanceId(id)) {
    console.error("Invalid or empty profile id (use letters, numbers, ._- only).");
    process.exit(1);
  }

  const manifest = loadManifest(repoRoot);
  let entry = getInstanceEntry(manifest, id);

  if (updateProfileOnly) {
    entry = await configureProfile(rl, repoRoot, id, entry);
    printBidBotsReminder(entry);
    console.log("\n[profile:update] Saved profile.json. Browser session was not changed.");
    rl.close();
    return;
  }

  if (!entry) {
    entry = await configureProfile(rl, repoRoot, id, undefined);
    printBidBotsReminder(entry);
  } else {
    printProfileSummary(id, manifest.profilesDir, entry);
    console.log("\nWhat do you want to do?\n");
    console.log("  [1]  Only refresh browser login (keep the settings above)");
    console.log("  [2]  Change settings first, then refresh login");
    console.log("  [3]  Update profile settings only (skip browser)\n");
    const step = (await rl.question("Enter 1, 2, or 3 [1]: ")).trim();
    const choice = step === "" ? "1" : step;
    if (choice === "3") {
      entry = await configureProfile(rl, repoRoot, id, entry);
      printBidBotsReminder(entry);
      console.log("\n[profile:update] Saved profile.json. Browser session was not changed.");
      rl.close();
      return;
    }
    if (choice === "2") {
      entry = await configureProfile(rl, repoRoot, id, entry);
      printBidBotsReminder(entry);
    } else if (choice === "1") {
      ensureDataDir(repoRoot, manifest.profilesDir, id);
      ensureInstanceLauncherBat(repoRoot, id);
    } else {
      console.error("Invalid choice (use 1, 2, or 3).");
      process.exit(1);
    }
  }

  process.env.BID_BOT_INSTANCE = id;
  const { config } = await import("../src/core/config.js");

  section("Browser login");
  console.log(`A window will open. Log into Lancers as profile "${id}".\n`);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.lancers.jp/", { waitUntil: "domcontentloaded" });
  await rl.question("When you are logged in, press Enter here to save the session... ");

  await mkdir(path.dirname(config.storageStatePath), { recursive: true });
  await context.storageState({ path: config.storageStatePath });
  await browser.close();

  console.log(`\nSaved: ${config.storageStatePath}`);
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
