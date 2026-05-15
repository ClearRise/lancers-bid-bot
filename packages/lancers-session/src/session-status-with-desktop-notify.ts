import type { BrowserContext } from "playwright";
import { LOGGED_OUT_DESKTOP_MESSAGE } from "./constants.js";
import { notifyLoggedOutDesktop } from "./notify-logged-out-desktop.js";
import {
  startLancersSessionStatusTracking,
  type LancersSessionStatusTracker,
} from "./session-status-tracker.js";

/** Starts periodic session checks; on logout logs `Logged out` and optionally shows the Windows toast. */
export function startLancersSessionStatusTrackingWithDesktopNotify(options: {
  context: BrowserContext;
  signal: AbortSignal;
  enabled: boolean;
  intervalMs?: number;
  desktopNotification: boolean;
  windowsToastAppId: string;
  logPrefix?: string;
}): LancersSessionStatusTracker {
  const logPrefix = options.logPrefix ?? "[session]";
  return startLancersSessionStatusTracking({
    context: options.context,
    signal: options.signal,
    enabled: options.enabled,
    intervalMs: options.intervalMs,
    logPrefix,
    onLoggedOut: async () => {
      console.log(`${logPrefix} ${LOGGED_OUT_DESKTOP_MESSAGE}`);
      await notifyLoggedOutDesktop({
        enabled: options.desktopNotification,
        appId: options.windowsToastAppId,
        logPrefix,
      });
    },
  });
}
