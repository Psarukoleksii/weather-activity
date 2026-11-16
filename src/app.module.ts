import { Module } from '@nestjs/common';
import { configurationModule } from './config/config.module';
import { AppConst } from './environment/consts/app.consts';
import { AppGraphQLModule } from './libs/graphql';
import { AppThrottlerModule } from './libs/throttler';
import { DatabaseModule } from './libs/typeorm';
import { ActivityRankingsModule } from './modules/activity-rankings/activity-rankings.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    configurationModule(AppConst.Api),
    // The api applies migrations on start; the worker starts after the api is healthy.
    DatabaseModule.forRoot({ migrationsRun: true }),
    AppThrottlerModule,
    AppGraphQLModule,
    HealthModule,
    ActivityRankingsModule,
  ],
})
export class AppModule {}
