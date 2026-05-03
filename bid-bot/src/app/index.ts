import { config } from "../core/config.js";
import { startApiServer, startApiServerWithHooks } from "./api-server.js";
import { startMonitorWorker } from "./monitor.js";

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

async function main(): Promise<void> {
  if (config.enableMonitor) {
    const worker = await startMonitorWorker(controller.signal);
    await startApiServerWithHooks(controller.signal, {
      onTaskQueued: worker.trigger,
    });
    return;
  }
  await startApiServer(controller.signal);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
