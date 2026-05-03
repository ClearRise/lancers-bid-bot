import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../core/config.js";
import { generateProposalText } from "./ai-proposal-mistral.js";
import type { TaskDetail } from "../core/types.js";

const templateCache = new Map<number, string>();
const warnedMissingTemplate = new Set<number>();

function resolveFromSrc(relativePathFromSrc: string): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  return path.resolve(currentDir, relativePathFromSrc);
}

function loadTemplateByDashboardIndex(index: number): string {
  if (templateCache.has(index)) {
    return templateCache.get(index) ?? "";
  }

  const templateNumber = index + 1;
  const templatePath = resolveFromSrc(`../../config/proposal_templates/template-${templateNumber}.txt`);
  try {
    const text = fs.readFileSync(templatePath, "utf8").trim();
    templateCache.set(index, text);
    return text;
  } catch {
    if (!warnedMissingTemplate.has(index)) {
      console.warn(
        `[proposal-template] Missing template file for dashboard index ${index}: config/proposal_templates/template-${templateNumber}.txt`,
      );
      warnedMissingTemplate.add(index);
    }
    templateCache.set(index, "");
    return "";
  }
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

  return generateProposalText(task);
}
