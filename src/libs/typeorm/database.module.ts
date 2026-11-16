import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DbConfigType } from './db-config.type';
import { TypeOrmConfigPgFactory, type TypeOrmExtraOptions } from './typeorm-config-pg.factory';

/**
 * TypeORM connection for Nest. Entities extend BaseEntity (Active Record): TypeORM binds them
 * to this DataSource on initialisation, so `Place.findOneBy(...)` works without repositories.
 */
@Module({})
export class DatabaseModule {
  static forRoot(options: TypeOrmExtraOptions = {}): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService<DbConfigType, true>) =>
            new TypeOrmConfigPgFactory(config, options).createTypeOrmOptions(),
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}
