/** When data counts as stale; used by the api (sync refresh) and the worker (background refresh). */
export interface RefreshConfigType {
  readonly refresh: {
    /** Older data is refreshed synchronously inside the request. */
    readonly syncRefreshAfterHours: number;
    /** Places requested within 24 h. */
    readonly hotRefreshHours: number;
    /** Places requested within 7 days. */
    readonly warmRefreshHours: number;
  };
}

/** Worker only: how RefreshPoller walks the places table. */
export interface RefreshPollerConfigType {
  readonly refreshPoller: {
    readonly pollIntervalSeconds: number;
    readonly batchSize: number;
    readonly retryAfterMinutes: number;
  };
}
