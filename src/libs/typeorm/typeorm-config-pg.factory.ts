import fs from 'node:fs';
import path from 'node:path';
import type { TlsOptions } from 'node:tls';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as entities from '../../models/entities';
import type { DbConfigType } from './db-config.type';
import type { ConfigPgOptions } from './types';

/**
 * Migrations are not imported: TypeORM loads them by path. `__dirname` points to
 * src/libs/typeorm under ts-node (CLI) and to dist/libs/typeorm in the built app,
 * so the same glob finds *.ts sources or compiled *.js.
 */
export const MIGRATIONS_GLOB = path.join(__dirname, '../../migrations/*{.ts,.js}');
export const MIGRATIONS_TABLE = 'migrations';

export interface TypeOrmExtraOptions {
  /** Apply pending migrations on start (api only; the worker starts after it). */
  migrationsRun?: boolean;
}

@Injectable()
export class TypeOrmConfigPgFactory implements TypeOrmOptionsFactory {
  private readonly configPg: ConfigPgOptions;

  public constructor(
    private readonly configService: ConfigService<DbConfigType, true>,
    private readonly extra: TypeOrmExtraOptions = {},
  ) {
    this.configPg = this.configService.getOrThrow('pg', { infer: true });
  }

  protected createBaseDataSourceOptions(): DataSourceOptions {
    const { host, port, database, username, password, logging, poolSize, maxQueryExecutionTime } = this.configPg;
    return {
      type: 'postgres',
      host,
      port,
      database,
      username,
      password,
      logging,
      ssl: this.createSslOptions(),
      poolSize,
      maxQueryExecutionTime,
      synchronize: false,
      entities: Object.values(entities),
      migrations: [MIGRATIONS_GLOB],
      migrationsTableName: MIGRATIONS_TABLE,
    } satisfies PostgresConnectionOptions;
  }

  /** Options for TypeOrmModule (Nest app and worker). */
  public createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      ...this.createBaseDataSourceOptions(),
      migrationsRun: this.extra.migrationsRun ?? false,
    };
  }

  /** Standalone DataSource for the TypeORM CLI. */
  public createTypeOrmDataSource(): DataSource {
    return new DataSource(this.createBaseDataSourceOptions());
  }

  /**
   * useSSL without certificate files: TLS with the system CAs (managed Postgres).
   * With files: CA / client certificate and key read from the project run dir.
   */
  private createSslOptions(): TlsOptions | undefined {
    const { useSSL, sslOptions } = this.configPg;
    if (!useSSL) return undefined;
    if (!sslOptions) throw new Error('pg.useSSL is set but pg.sslOptions are missing');

    const read = (file?: string) => (file ? fs.readFileSync(path.resolve(file)) : undefined);
    return {
      ca: read(sslOptions.ca),
      cert: read(sslOptions.cert),
      key: read(sslOptions.key),
      rejectUnauthorized: sslOptions.rejectUnauthorized,
    };
  }
}
