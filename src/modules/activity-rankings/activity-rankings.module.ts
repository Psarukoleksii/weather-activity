import { Module } from '@nestjs/common';
import { ForecastRefreshModule } from '../forecast-refresh/forecast-refresh.module';
import { PlacesModule } from '../places/places.module';
import { ActivityRankingsResolver } from './activity-rankings.resolver';
import { ActivityRankingsService } from './activity-rankings.service';

@Module({
  imports: [PlacesModule, ForecastRefreshModule],
  providers: [ActivityRankingsResolver, ActivityRankingsService],
})
export class ActivityRankingsModule {}
