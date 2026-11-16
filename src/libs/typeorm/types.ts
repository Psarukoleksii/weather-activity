import type { LogLevel } from 'typeorm/logger/Logger';

export interface ConfigPgSslOptions {
  /** Paths to PEM files, resolved from the process working directory. */
  readonly ca?: string;
  readonly cert?: string;
  readonly key?: string;
  readonly rejectUnauthorized: boolean;
}

export interface ConfigPgOptions {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  readonly logging: boolean | 'all' | LogLevel[];
  readonly useSSL: boolean;
  readonly sslOptions?: ConfigPgSslOptions;
  readonly poolSize?: number;
  /** Queries slower than this (ms) are logged as slow. */
  readonly maxQueryExecutionTime?: number;
}
