import { registerAs } from '@nestjs/config';
import type { LogLevel } from 'typeorm/logger/Logger';
import type { ConfigPgOptions, DbConfigType } from '../../libs/typeorm';
import { get } from '../utils/env-var';

const LOG_LEVELS = ['query', 'schema', 'error', 'warn', 'info', 'log', 'migration'] as const satisfies readonly LogLevel[];

/** DB_LOGGING: true | false | all | comma-separated levels (query,error,warn,info,log,schema,migration). */
function parseLogging(value: string): ConfigPgOptions['logging'] {
  const v = value.toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'all') return 'all';
  const levels = v.split(',').map((l) => l.trim()).filter(Boolean);
  const unknown = levels.filter((l) => !(LOG_LEVELS as readonly string[]).includes(l));
  if (unknown.length) throw new Error(`Env DB_LOGGING has unknown levels: ${unknown.join(', ')}`);
  return levels as LogLevel[];
}

export const environmentPgFactory = registerAs('pg', (): DbConfigType => {
  const useSSL = get('DB_SSL').default('false').asBoolStrict()!;
  return {
    pg: {
      host: get('DB_HOST').default('localhost').asString()!,
      port: get('DB_PORT').default('5432').asPortNumber()!,
      database: get('DB_NAME').default('weather').asString()!,
      username: get('DB_USER').default('app').asString()!,
      password: get('DB_PASSWORD').default('app').asString()!,
      logging: parseLogging(get('DB_LOGGING').default('error,warn,migration').asString()!),
      useSSL,
      // Certificate files are optional: without them TLS uses the system CAs.
      sslOptions: useSSL
        ? {
            ca: get('DB_SSL_CA').asString(),
            cert: get('DB_SSL_CERT').asString(),
            key: get('DB_SSL_KEY').asString(),
            rejectUnauthorized: get('DB_SSL_REJECT_UNAUTHORIZED').default('true').asBoolStrict()!,
          }
        : undefined,
      poolSize: get('DB_POOL_SIZE').default('10').asIntPositive(),
      maxQueryExecutionTime: get('DB_MAX_QUERY_EXECUTION_TIME_MS').default('500').asIntPositive(),
    } satisfies ConfigPgOptions,
  };
});
