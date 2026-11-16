/** Rate limit per IP: `limit` requests per `ttlSeconds`. */
export interface ThrottleConfigType {
  readonly throttle: {
    readonly ttlSeconds: number;
    readonly limit: number;
  };
}
