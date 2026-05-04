import fs from "node:fs";
import path from "node:path";
import { config } from "../core/config.js";
import {
  instanceConfigDirAbs,
  legacyRepoConfigTemplate,
  obsoleteRepoConfigTemplate,
} from "../core/instance-content-paths.js";
import { generateProposalText as generateOpenAiProposal } from "./ai-proposal-openai.js";
import { generateProposalText as generateMistralProposal } from "./ai-proposal-mistral.js";
import type { TaskDetail } from "../core/types.js";

const templateCache = new Map<number, string>();
const warnedMissingTemplate = new Set<number>();

function loadTemplateByDashboardIndex(index: number): string {
  if (templateCache.has(index)) {
    return templateCache.get(index) ?? "";
  }

  const templateNumber = index + 1;
  const repoRoot = process.cwd();
  const configDir = instanceConfigDirAbs(repoRoot, config.storageStatePath);
  const primary = path.join(configDir, "proposal_templates", `template-${templateNumber}.txt`);
  const legacy = legacyRepoConfigTemplate(repoRoot, templateNumber);
  const obsolete = obsoleteRepoConfigTemplate(repoRoot, templateNumber);

  let text = "";
  for (const p of [primary, legacy, obsolete]) {
    try {
      const t = fs.readFileSync(p, "utf8").trim();
      if (t.length > 0) {
        text = t;
        break;
      }
    } catch {
      /* try next */
    }
  }

  if (!text && !warnedMissingTemplate.has(index)) {
    console.warn(
      `[proposal-template] Empty or missing template for dashboard index ${index}: ${primary} (or legacy ${legacy})`,
    );
    warnedMissingTemplate.add(index);
  }

  templateCache.set(index, text);
  return text;
}

function applyPlaceholders(template: string, task: TaskDetail): string {
  const dashboardIndex = task.dashboardUrlIndex ?? null;
  return template
    .replaceAll("{{TITLE}}", task.title)
    .replaceAll("{{CLIENT_NAME}}", task.clientName ?? "")
    .replaceAll("{{BUDGET_TEXT}}", task.budgetText ?? "")
    .replaceAll("{{BUDGET_MIN_JPY}}", task.budgetMinJpy != null ? String(task.budgetMinJpy) : "")
    .replaceAll("{{BUDGET_MAX_JPY}}", task.budgetMaxJpy != null ? String(task.budgetMaxJpy) : "")
    .replaceAll("{{DEADLINE}}", task.deadline ?? "");
}

export async function buildProposalText(task: TaskDetail): Promise<string | null> {
  if (config.proposalMode === "template") {
    const dashboardIndex = task.dashboardUrlIndex;
    if (dashboardIndex == null || dashboardIndex < 0) {
      console.warn(
        `[proposal-template] Missing dashboardUrlIndex for work_id=${task.workId}; cannot resolve template`,
      );
      return null;
    }

    const template = loadTemplateByDashboardIndex(dashboardIndex);
    if (!template) return null;
    return applyPlaceholders(template, task);
  }

  if (config.bidAiProvider === "openai") {
    return generateOpenAiProposal(task);
  }
  return generateMistralProposal(task);
}
