import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions, ThrottlerOptionsFactory } from '@nestjs/throttler';
import type { RedisConfigType } from '../../environment/types/redis-config.type';
import type { ThrottleConfigType } from './throttle-config.type';

/** Rate limit per IP with counters in Redis, shared by all api replicas. */
@Injectable()
export class ThrottlerConfigFactory implements ThrottlerOptionsFactory {
  public constructor(private readonly configService: ConfigService<ThrottleConfigType & RedisConfigType, true>) {}

  public createThrottlerOptions(): ThrottlerModuleOptions {
    const { ttlSeconds, limit } = this.configService.getOrThrow('throttle', { infer: true });
    return {
      throttlers: [{ ttl: ttlSeconds * 1000, limit }],
      storage: new ThrottlerStorageRedisService(this.configService.getOrThrow('redis.url', { infer: true })),
    };
  }
}
