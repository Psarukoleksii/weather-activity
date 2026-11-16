import { Module } from '@nestjs/common';
import { configurationModule } from '../../config/config.module';
import { AppConst } from '../../environment/consts/app.consts';
import { DatabaseModule } from '../../libs/typeorm';
import { ForecastRefreshModule } from '../../modules/forecast-refresh/forecast-refresh.module';

/** Same settings as the worker, without the poller: only the database and the scoring path. */
@Module({
  imports: [configurationModule(AppConst.Worker), DatabaseModule.forRoot(), ForecastRefreshModule],
})
export class RecomputeScoresModule {}
