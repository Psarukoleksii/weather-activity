import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions, ThrottlerOptionsFactory } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis';
import type { ThrottleConfigType } from './throttle-config.type';

/** Rate limit per IP with counters in Redis, shared by all api replicas. */
@Injectable()
export class ThrottlerConfigFactory implements ThrottlerOptionsFactory {
  public constructor(
    private readonly configService: ConfigService<ThrottleConfigType, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  public createThrottlerOptions(): ThrottlerModuleOptions {
    const { ttlSeconds, limit } = this.configService.getOrThrow('throttle', { infer: true });
    return {
      throttlers: [{ ttl: ttlSeconds * 1000, limit }],
      // The shared client: RedisModule owns its lifecycle, the storage does not disconnect it.
      storage: new ThrottlerStorageRedisService(this.redis),
    };
  }
}
