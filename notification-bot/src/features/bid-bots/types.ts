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
  /** If set, full URL (otherwise http://127.0.0.1:port/notify) */
  notifyUrl?: string;
  /** Override host only if not localhost (default 127.0.0.1) */
  host?: string;
  port: number;
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
  taskCategoryKeys?: string[];
};

export type BidBotsConfigFile = {
  bidBots: BidBotConfigFileEntry[];
};
