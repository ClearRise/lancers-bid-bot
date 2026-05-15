import fs from "node:fs/promises";
import { dirname } from "node:path";

export type QueuedTask = {
  workId: string;
  dashboardUrlIndex: number | null;
};

function normalizeQueueItem(item: unknown): QueuedTask | null {
  if (typeof item === "string" && item.length > 0) {
    return { workId: item, dashboardUrlIndex: null };
  }
  if (typeof item !== "object" || item === null) return null;

  const candidate = item as { workId?: unknown; dashboardUrlIndex?: unknown };
  if (typeof candidate.workId !== "string" || candidate.workId.length === 0) return null;

  const index =
    typeof candidate.dashboardUrlIndex === "number" && Number.isInteger(candidate.dashboardUrlIndex)
      ? candidate.dashboardUrlIndex
      : null;
  return { workId: candidate.workId, dashboardUrlIndex: index };
}

export async function loadQueue(path: string): Promise<QueuedTask[]> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeQueueItem)
      .filter((item): item is QueuedTask => item !== null);
  } catch {
    return [];
  }
}

export async function saveQueue(path: string, queue: QueuedTask[]): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(queue, null, 2), "utf8");
}

export function enqueueUnique(
  queue: QueuedTask[],
  workId: string,
  dashboardUrlIndex: number | null,
): { queue: QueuedTask[]; added: boolean } {
  const exists = queue.some((item) => item.workId === workId);
  if (exists) return { queue, added: false };
  return { queue: [...queue, { workId, dashboardUrlIndex }], added: true };
}

export async function enqueueTask(
  path: string,
  workId: string,
  dashboardUrlIndex: number | null,
): Promise<{ added: boolean; queueSize: number }> {
  const queue = await loadQueue(path);
  const next = enqueueUnique(queue, workId, dashboardUrlIndex);
  if (next.added) {
    await saveQueue(path, next.queue);
  }
  return { added: next.added, queueSize: next.queue.length };
}

export async function takeQueuedTasks(
  path: string,
  maxCount: number,
): Promise<{ tasks: QueuedTask[]; queueSize: number }> {
  const queue = await loadQueue(path);
  const tasks = queue.slice(0, maxCount);
  const remaining = queue.slice(maxCount);
  if (tasks.length > 0) {
    await saveQueue(path, remaining);
  }
  return { tasks, queueSize: remaining.length };
}

/** Put tasks at the front of the queue (e.g. after aborting a batch). */
export async function prependTasksToQueue(path: string, tasks: QueuedTask[]): Promise<void> {
  if (tasks.length === 0) return;
  const existing = await loadQueue(path);
  await saveQueue(path, [...tasks, ...existing]);
}
