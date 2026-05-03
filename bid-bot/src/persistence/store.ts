import fs from "node:fs/promises";
import { dirname } from "node:path";

type BidHistoryEntry = {
  attemptedAt: string;
  status: string;
  reason?: string;
  stepHistory?: Array<{
    step: string;
    status: "ok" | "skipped" | "failed";
    message?: string;
    at: string;
  }>;
};

type BidHistory = Record<string, BidHistoryEntry>;

export async function loadHistory(path: string): Promise<BidHistory> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as BidHistory;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export async function saveHistory(path: string, data: BidHistory): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(data, null, 2), "utf8");
}
