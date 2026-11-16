import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import { configurationModule } from './config/config.module';
import { AppConst } from './environment/consts/app.consts';
import type { RedisConfigType } from './environment/types/redis-config.type';
import type { ThrottleConfigType } from './environment/types/throttle-config.type';
import { DatabaseModule } from './libs/typeorm';
import { ActivityRankingsModule } from './modules/activity-rankings/activity-rankings.module';
import { GqlThrottlerGuard } from './modules/activity-rankings/gql-throttler.guard';
import { GraphQLErrorPassthroughFilter } from './modules/activity-rankings/graphql-error.filter';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    configurationModule(AppConst.Api),
    // The api applies migrations on start; the worker starts after the api is healthy.
    DatabaseModule.forRoot({ migrationsRun: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      // Per-IP counters in Redis, shared by all api replicas.
      useFactory: (config: ConfigService<ThrottleConfigType & RedisConfigType, true>) => ({
        throttlers: [
          {
            ttl: config.getOrThrow('throttle.ttlSeconds', { infer: true }) * 1000,
            limit: config.getOrThrow('throttle.limit', { infer: true }),
          },
        ],
        storage: new ThrottlerStorageRedisService(config.getOrThrow('redis.url', { infer: true })),
      }),
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      playground: false,
      introspection: true,
      // Keep the status from extensions.http (429 from GqlThrottlerGuard); Nest resets it to 200 by default.
      preserveHttpStatusForExecutionErrors: false,
      // The throttler guard needs req/res from the GraphQL context.
      context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
    }),
    HealthModule,
    ActivityRankingsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    { provide: APP_FILTER, useClass: GraphQLErrorPassthroughFilter },
  ],
})
export class AppModule {}
