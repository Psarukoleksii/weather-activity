import { Place } from '../../models/place.entity';
import { GeocodingMissCache } from './geocoding-miss.cache';
import { PlacesService } from './places.service';

class FakeRedis {
  store = new Map<string, { value: string; ex: number }>();
  failing = false;
  async exists(key: string) {
    if (this.failing) throw new Error('ECONNREFUSED');
    return this.store.has(key) ? 1 : 0;
  }
  async set(key: string, value: string, _mode: 'EX', ex: number) {
    if (this.failing) throw new Error('ECONNREFUSED');
    this.store.set(key, { value, ex });
    return 'OK';
  }
}

const config = { getOrThrow: () => 3600 };

describe('GeocodingMissCache', () => {
  it('keys by country and normalised name', () => {
    expect(GeocodingMissCache.key('  Qwértyzzz ', 'pl')).toBe('geocode:miss:PL:qwertyzzz');
  });

  it('remembers a miss with the configured TTL', async () => {
    const redis = new FakeRedis();
    const cache = new GeocodingMissCache(redis as never, config as never);
    expect(await cache.isKnownMiss('Qwertyzzz', 'PL')).toBe(false);
    await cache.rememberMiss('Qwertyzzz', 'PL');
    expect(await cache.isKnownMiss('qwertyzzz', 'pl')).toBe(true);
    expect(redis.store.get('geocode:miss:PL:qwertyzzz')?.ex).toBe(3600);
  });

  it('fails open when Redis is down', async () => {
    const redis = new FakeRedis();
    redis.failing = true;
    const cache = new GeocodingMissCache(redis as never, config as never);
    await expect(cache.isKnownMiss('Qwertyzzz', 'PL')).resolves.toBe(false);
    await expect(cache.rememberMiss('Qwertyzzz', 'PL')).resolves.toBeUndefined();
  });
});

describe('PlacesService.createFromGeocoder with the negative cache', () => {
  it('asks the geocoder once for an unknown city, then answers from the cache', async () => {
    const geocode = jest.fn().mockResolvedValue(null);
    const cache = new GeocodingMissCache(new FakeRedis() as never, config as never);
    const service = new PlacesService({ geocode } as never, cache);

    expect(await service.createFromGeocoder('Qwertyzzz', 'PL')).toBeNull();
    expect(await service.createFromGeocoder('Qwertyzzz', 'PL')).toBeNull();
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('does not cache upstream errors', async () => {
    const geocode = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(null);
    const cache = new GeocodingMissCache(new FakeRedis() as never, config as never);
    const service = new PlacesService({ geocode } as never, cache);

    await expect(service.createFromGeocoder('Zakopane', 'PL')).rejects.toThrow('timeout');
    expect(await cache.isKnownMiss('Zakopane', 'PL')).toBe(false);
  });

  it('does not touch the database on a cached miss', async () => {
    const spy = jest.spyOn(Place, 'createQueryBuilder');
    const cache = new GeocodingMissCache(new FakeRedis() as never, config as never);
    await cache.rememberMiss('Qwertyzzz', 'PL');
    const service = new PlacesService({ geocode: jest.fn() } as never, cache);
    await service.createFromGeocoder('Qwertyzzz', 'PL');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
