import { config } from "../../core/config.js";
import { isTaskSuitableByAi } from "./ai-filter-test.js";
// import { isTaskSuitableByAi } from "./ai-filter-openai.js";
// import { isTaskSuitableByAi } from "./ai-filter-deepseek.js";
import type { ScrapedTask } from "../../core/types.js";

function normalize(s: string): string {
  return s.toLowerCase();
}

/**
 * Returns true if the task passes keyword / budget filters.
 */
export async function isTaskSuitable(task: ScrapedTask): Promise<boolean> {
  const normalizedSnippet = normalize(task.snippet);

  if (config.keywordFilterEnabled) {
    for (const keyword of config.excludeKeywords) {
      if (keyword && normalizedSnippet.includes(normalize(keyword))) {
        console.log(`[filter][${task.workId}] reject reason=exclude_keyword keyword="${keyword}"`);
        return false;
      }
    }

    if (config.includeKeywords.length > 0) {
      const any = config.includeKeywords.some(
        (keyword) => keyword && normalizedSnippet.includes(normalize(keyword)),
      );
      if (!any) {
        console.log(`[filter][${task.workId}] reject reason=no_include_keyword_match`);
        return false;
      }
    }
  }

  const tMin = task.budgetMinJpy;
  const tMax = task.budgetMaxJpy;
  const unknown = tMin == null || tMax == null;

  if (unknown) {
    if (config.skipIfBudgetUnknown) {
      console.log(`[filter][${task.workId}] reject reason=budget_unknown`);
      return false;
    }
  } else {
    const uMin = config.minBudgetJpy;
    const uMax = config.maxBudgetJpy;
    if (uMin != null && tMax < uMin) {
      console.log(`[filter][${task.workId}] reject reason=budget_below_min task_max=${tMax} min=${uMin}`);
      return false;
    }
    if (uMax != null && tMin > uMax) {
      console.log(`[filter][${task.workId}] reject reason=budget_above_max task_min=${tMin} max=${uMax}`);
      return false;
    }
  }

  if (config.aiFilterEnabled) {
    try {
      const ai = await isTaskSuitableByAi(task);
      if (!ai.suitable) {
        console.log(`[filter][${task.workId}] reject reason=ai_not_matched detail="${ai.reason ?? ""}"`);
        return false;
      }
    } catch (error) {
      console.error(`[filter][${task.workId}] reject reason=ai_filter_error`, error);
      return false;
    }
  }

  console.log(`[filter][${task.workId}] pass`);
  return true;
}
