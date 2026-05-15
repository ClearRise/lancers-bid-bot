import type { BrowserContext } from "playwright";
import { DEFAULT_SESSION_STATUS_INTERVAL_MS } from "./constants.js";
import { probeLancersLoggedOut } from "./probe-lancers-login.js";
import { sleepUntil } from "./sleep-abort.js";
export type LancersSessionStatusTracker = {
  isLoggedOut: () => boolean;
};

/**
 * Periodically probes Lancers session via a disposable tab. When logged out, invokes `onLoggedOut` once and stops.
 */
export function startLancersSessionStatusTracking(options: {
  context: BrowserContext;  signal: AbortSignal;
  enabled: boolean;
  intervalMs?: number;
  onLoggedOut: () => void | Promise<void>;
  logPrefix: string;
}): LancersSessionStatusTracker {
  if (!options.enabled) {
    return { isLoggedOut: () => false };
  }

  let loggedOut = false;
  const intervalMs = options.intervalMs ?? DEFAULT_SESSION_STATUS_INTERVAL_MS;

  const loop = async () => {
    while (!options.signal.aborted && !loggedOut) {
      try {
        if (await probeLancersLoggedOut(options.context)) {
          if (!loggedOut) {
            loggedOut = true;
            await options.onLoggedOut();
          }
          break;
        }
      } catch (err) {
        console.warn(`${options.logPrefix} session check failed`, err);
      }
      await sleepUntil(intervalMs, options.signal);
    }
  };

  void loop();
  return { isLoggedOut: () => loggedOut };
}
