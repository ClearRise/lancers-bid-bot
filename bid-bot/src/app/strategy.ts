import { config } from "../core/config.js";
import type { BidCandidate, TaskSummary } from "../core/types.js";

export function selectCandidates(tasks: TaskSummary[], alreadyAttempted: Set<string>): BidCandidate[] {
  const out: BidCandidate[] = [];

  for (const task of tasks) {
    if (alreadyAttempted.has(task.workId)) continue;
    if (config.minBudgetJpy != null && task.budgetMaxJpy != null && task.budgetMaxJpy < config.minBudgetJpy) {
      continue;
    }
    if (config.maxBudgetJpy != null && task.budgetMinJpy != null && task.budgetMinJpy > config.maxBudgetJpy) {
      continue;
    }

    const score = computeScore(task);
    out.push({ ...task, score, reason: "budget-and-freshness-match" });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, config.maxBidsPerCycle);
}

function computeScore(task: TaskSummary): number {
  const base = 100;
  const budgetBonus = task.budgetMaxJpy ? Math.min(50, Math.floor(task.budgetMaxJpy / 10_000)) : 0;
  return base + budgetBonus;
}
