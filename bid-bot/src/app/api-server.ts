import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "../core/config.js";
import { enqueueTask, loadQueue } from "../persistence/queue-store.js";
import { error, log } from "../core/logger.js";

type NotifyPayload = {
  source?: string;
  workId?: string;
  dashboardUrlIndex?: number;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += String(chunk);
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function isValidPayload(payload: NotifyPayload): payload is Required<Pick<NotifyPayload, "workId">> & NotifyPayload {
  return typeof payload.workId === "string" && payload.workId.length > 0;
}

function parseDashboardUrlIndex(payload: NotifyPayload): number | null {
  if (payload.dashboardUrlIndex == null) return null;
  if (Number.isInteger(payload.dashboardUrlIndex) && payload.dashboardUrlIndex >= 0) {
    return payload.dashboardUrlIndex;
  }
  return null;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export async function startApiServer(signal: AbortSignal): Promise<void> {
  return startApiServerWithHooks(signal);
}

type ApiHooks = {
  onTaskQueued?: () => void;
};

export async function startApiServerWithHooks(
  signal: AbortSignal,
  hooks: ApiHooks = {},
): Promise<void> {
  const initialQueue = await loadQueue(config.bidQueuePath);
  log("api", `loaded queue_size=${initialQueue.length}`);

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        const queue = await loadQueue(config.bidQueuePath);
        return json(res, 200, { ok: true, queueSize: queue.length });
      }

      if (req.method === "POST" && req.url === "/notify") {
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as NotifyPayload;
        if (!isValidPayload(payload)) {
          return json(res, 400, { ok: false, error: "invalid_payload" });
        }

        const dashboardUrlIndex = parseDashboardUrlIndex(payload);
        const result = await enqueueTask(config.bidQueuePath, payload.workId, dashboardUrlIndex);
        if (result.added) {
          log(
            "api",
            `queued work_id=${payload.workId} dashboard_url_index=${dashboardUrlIndex ?? "n/a"} queue_size=${result.queueSize}`,
          );
          hooks.onTaskQueued?.();
        } else {
          log("api", `duplicate_ignored work_id=${payload.workId}`);
        }
        return json(res, 200, { ok: true, queued: result.added, queueSize: result.queueSize });
      }

      json(res, 404, { ok: false, error: "not_found" });
    } catch (e) {
      error("api", "request_failed", e);
      json(res, 500, { ok: false, error: "internal_error" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.bidBotPort, () => resolve());
  });
  log("api", `listening port=${config.bidBotPort}`);

  await new Promise<void>((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        server.close(() => resolve());
      },
      { once: true },
    );
  });
  log("api", "shutdown complete");
}
