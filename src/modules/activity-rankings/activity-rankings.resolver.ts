import { Args, Query, Resolver } from '@nestjs/graphql';
import { ActivityRankingsService } from './activity-rankings.service';
import { ActivityRankingsArgs, ActivityRankingsResultDto } from './dto/activity-rankings.types';

@Resolver(() => ActivityRankingsResultDto)
export class ActivityRankingsResolver {
  constructor(private readonly rankings: ActivityRankingsService) {}

  @Query(() => ActivityRankingsResultDto, {
    description: 'For each activity, the next 7 days ranked from best to worst',
  })
  activityRankings(@Args() { city, country }: ActivityRankingsArgs): Promise<ActivityRankingsResultDto> {
    return this.rankings.getRankings(city, country);
  }
}
