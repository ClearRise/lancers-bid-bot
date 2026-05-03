/**
 * Resolved bid-bot target used at runtime (after host/port/path → URL).
 */
export type BidBotNotifyTarget = {
  id: string;
  notifyUrl: string;
};

/**
 * Raw entry in config/bid_bots.json (before URL resolution).
 */
export type BidBotConfigFileEntry = {
  id: string;
  /** If set, overrides host/port/notifyPath */
  notifyUrl?: string;
  host?: string;
  port: number;
  /** Default "/notify" */
  notifyPath?: string;
  /** If true (default), this entry is used */
  enabled?: boolean;
  /**
   * Lancers list/search URLs the **notification-bot** opens to discover new tasks (not the bid-bot idle dashboard).
   */
  notificationDashboardUrls?: string[];
  /** @deprecated Use `notificationDashboardUrls` */
  dashboardUrls?: string[];
  /**
   * Names of URLs from `config/settings.json` → `notificationMonitorUrls`. Each bid-bot only polls and notifies for tasks from the dashboards it lists here.
   */
  notificationDashboardKeys?: string[];
};

export type BidBotsConfigFile = {
  bidBots: BidBotConfigFileEntry[];
};
