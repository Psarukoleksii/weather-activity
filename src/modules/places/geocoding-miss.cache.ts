import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../libs/redis';
import { normalizeName } from '../../utils/normalize-name';
import type { PlacesConfigType } from './places-config.type';

/**
 * Negative cache of the geocoder: remembers for GEOCODE_NOT_FOUND_TTL_SECONDS that a city is unknown,
 * so repeating "Qwertyzzz, PL" does not call Open-Meteo every time.
 * Fails open: if Redis is unavailable the request just goes to the geocoder.
 */
@Injectable()
export class GeocodingMissCache {
  private readonly logger = new Logger(GeocodingMissCache.name);
  private readonly ttlSeconds: number;

  public constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService<PlacesConfigType, true>,
  ) {
    this.ttlSeconds = config.getOrThrow('places.notFoundCacheTtlSeconds', { infer: true });
  }

  static key(city: string, countryCode: string): string {
    return `geocode:miss:${countryCode.toUpperCase()}:${normalizeName(city)}`;
  }

  async isKnownMiss(city: string, countryCode: string): Promise<boolean> {
    try {
      return (await this.redis.exists(GeocodingMissCache.key(city, countryCode))) === 1;
    } catch (err) {
      this.logger.warn(`Negative cache read failed, asking the geocoder: ${(err as Error).message}`);
      return false;
    }
  }

  async rememberMiss(city: string, countryCode: string): Promise<void> {
    try {
      await this.redis.set(GeocodingMissCache.key(city, countryCode), '1', 'EX', this.ttlSeconds);
    } catch (err) {
      this.logger.warn(`Negative cache write failed: ${(err as Error).message}`);
    }
  }
}
