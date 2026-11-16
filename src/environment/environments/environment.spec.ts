import { AppConst } from '../consts/app.consts';
import { environmentPgFactory } from '../factories/environment-pg.factory';
import { get } from '../utils/env-var';
import { environment } from './environment';

describe('env-var helper', () => {
  const env = { N: '5', ZERO: '0', EMPTY: '  ', B: 'TRUE', BAD: 'yes', L: 'a, b,,c' };

  it('parses values and falls back to defaults', () => {
    expect(get('N', env).asIntPositive()).toBe(5);
    expect(get('MISSING', env).default('7').asIntPositive()).toBe(7);
    expect(get('EMPTY', env).default('x').asString()).toBe('x');
    expect(get('MISSING', env).asString()).toBeUndefined();
    expect(get('B', env).asBoolStrict()).toBe(true);
    expect(get('L', env).asArray()).toEqual(['a', 'b', 'c']);
  });

  it('rejects invalid and missing required values', () => {
    expect(() => get('ZERO', env).asIntPositive()).toThrow('Env ZERO must be a positive integer, got "0"');
    expect(() => get('BAD', env).asBoolStrict()).toThrow('Env BAD must be "true" or "false"');
    expect(() => get('N', env).asEnum(['a', 'b'])).toThrow('one of a, b');
    expect(() => get('MISSING', env).required().asString()).toThrow('Env MISSING is required');
  });
});

describe('environment', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('api config has every api section with defaults', () => {
    const config = environment(AppConst.Api);
    expect(Object.keys(config).sort()).toEqual(['openMeteo', 'pg', 'port', 'redis', 'refresh', 'scoring', 'throttle']);
    expect(config.port).toBe(3000);
    expect(config.throttle).toEqual({ ttlSeconds: 60, limit: 60 });
    expect(config.pg).toMatchObject({ port: 5432, useSSL: false, maxQueryExecutionTime: 500, logging: ['error', 'warn', 'migration'] });
  });

  it('worker config has no HTTP or Redis sections', () => {
    const config = environment(AppConst.Worker);
    expect(Object.keys(config).sort()).toEqual(['openMeteo', 'pg', 'refresh', 'refreshPoller', 'scoring']);
    expect(config.refreshPoller).toEqual({ pollIntervalSeconds: 60, batchSize: 10, retryAfterMinutes: 15 });
  });

  it('reads overrides from the environment', () => {
    process.env.WORKER_BATCH_SIZE = '25';
    process.env.DB_LOGGING = 'all';
    const config = environment(AppConst.Worker);
    expect(config.refreshPoller.batchSize).toBe(25);
    expect(config.pg.logging).toBe('all');
  });

  it('pg: SSL options only when DB_SSL is on; unknown log levels fail fast', () => {
    process.env.DB_SSL = 'true';
    process.env.DB_SSL_CA = 'certs/ca.pem';
    expect(environmentPgFactory().pg.sslOptions).toEqual({
      ca: 'certs/ca.pem',
      cert: undefined,
      key: undefined,
      rejectUnauthorized: true,
    });
    process.env.DB_LOGGING = 'error,verbose';
    expect(() => environmentPgFactory()).toThrow('unknown levels: verbose');
  });
});
