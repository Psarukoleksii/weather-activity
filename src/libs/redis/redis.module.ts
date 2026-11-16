import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { RedisConfigType } from './redis-config.type';

/** Shared ioredis client of the api (rate limit counters, geocoding negative cache). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<RedisConfigType, true>) =>
        // Few retries: callers that can live without Redis (caches) should fail fast, not hang.
        new Redis(config.getOrThrow('redis.url', { infer: true }), { maxRetriesPerRequest: 2 }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  public constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}
