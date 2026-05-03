import { config } from "../core/config.js";
import { assertBidBotsReachable } from "./check-bid-bots.js";
import { runMonitorLoop } from "./monitor.js";

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

await assertBidBotsReachable(config.bidBotTargetsPerDashboardIndex);

runMonitorLoop(controller.signal).catch((err) => {
  console.error(err);
  process.exit(1);
});
