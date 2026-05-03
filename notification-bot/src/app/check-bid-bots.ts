import type { BidBotNotifyTarget } from "../features/bid-bots/types.js";

function uniqueBidBotTargets(targetsPerIndex: BidBotNotifyTarget[][]): BidBotNotifyTarget[] {
  const byId = new Map<string, BidBotNotifyTarget>();
  for (const row of targetsPerIndex) {
    for (const t of row) {
      if (!byId.has(t.id)) byId.set(t.id, t);
    }
  }
  return [...byId.values()];
}

/** bid-bot exposes GET /health on the same origin as POST /notify */
function healthCheckUrl(notifyUrl: string): string {
  const u = new URL(notifyUrl);
  u.pathname = "/health";
  u.search = "";
  u.hash = "";
  return u.href;
}

/**
 * Verifies each configured bid-bot responds on GET /health.
 * Logs per-target status; exits the process if none configured or any check fails.
 */
export async function assertBidBotsReachable(targetsPerIndex: BidBotNotifyTarget[][]): Promise<void> {
  const targets = uniqueBidBotTargets(targetsPerIndex);

  if (targets.length === 0) {
    console.error(
      "[startup] No bid-bot targets: each notificationDashboardUrls entry in config/bid_bots.json must map to a bid-bot notify URL.",
    );
    process.exit(1);
  }

  console.log(`[startup] Checking connection to ${targets.length} bid-bot(s)…`);
  let okCount = 0;

  for (const t of targets) {
    const healthUrl = healthCheckUrl(t.notifyUrl);
    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        okCount += 1;
        console.log(`[startup] bid-bot "${t.id}" connected  ${healthUrl}`);
      } else {
        console.error(`[startup] bid-bot "${t.id}" NOT connected  ${healthUrl}  HTTP ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[startup] bid-bot "${t.id}" NOT connected  ${healthUrl}  ${msg}`);
    }
  }

  if (okCount === 0) {
    console.error(
      `[startup] Exiting: no bid-bot responded on GET /health. Start at least one bid-bot and check URLs in config/bid_bots.json.`,
    );
    process.exit(1);
  }

  if (okCount < targets.length) {
    console.warn(
      `[startup] Warning: ${okCount}/${targets.length} bid-bot(s) reachable; monitor will run with partial connectivity.`,
    );
  } else {
    console.log(`[startup] All bid-bot(s) reachable.`);
  }
}
