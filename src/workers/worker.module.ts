import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { configurationModule } from '../config/config.module';
import { AppConst } from '../environment/consts/app.consts';
import { DatabaseModule } from '../libs/typeorm';
import { ForecastRefreshModule } from '../modules/forecast-refresh/forecast-refresh.module';
import { RefreshPoller } from '../modules/forecast-refresh/refresh.poller';

/** No HTTP, no GraphQL, no Redis: only the refresh path and its poller. */
@Module({
  imports: [
    configurationModule(AppConst.Worker),
    DatabaseModule.forRoot(),
    ScheduleModule.forRoot(),
    ForecastRefreshModule,
  ],
  providers: [RefreshPoller],
})
export class WorkerModule {}
