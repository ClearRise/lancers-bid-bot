export type ScrapedTask = {
  workId: string;
  url: string;
  title: string;
  snippet: string;
  /**
   * From `.p-search-job-media__price`: min/max of all `.p-search-job-media__number` values (range or single).
   */
  budgetMinJpy: number | null;
  budgetMaxJpy: number | null;
  /** Full normalized text from `.p-search-job-media__price` (for toasts / display). */
  budgetDisplayText: string | null;
  /**
   * Back-compat: same as `budgetMaxJpy` when known, else legacy single-number parse from snippet.
   */
  budgetJpy: number | null;
};
