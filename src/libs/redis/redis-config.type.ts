/** Redis is used only by the api, for rate limit counters. */
export interface RedisConfigType {
  readonly redis: {
    readonly url: string;
  };
}
