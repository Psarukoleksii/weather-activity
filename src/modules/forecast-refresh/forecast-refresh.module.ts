import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { WeatherModule } from '../weather/weather.module';
import { ForecastRefreshService } from './forecast-refresh.service';

/** RefreshPoller is not provided here: only WorkerModule registers it. */
@Module({
  imports: [WeatherModule, ScoringModule],
  providers: [ForecastRefreshService],
  exports: [ForecastRefreshService],
})
export class ForecastRefreshModule {}
