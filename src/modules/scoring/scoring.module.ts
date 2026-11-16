import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScoringConfigType } from './scoring-config.type';
import { ActivityScoringService } from './activity-scoring.service';

@Module({
  providers: [
    {
      provide: ActivityScoringService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ScoringConfigType, true>) =>
        new ActivityScoringService({ skiMinElevationM: config.getOrThrow('scoring.skiMinElevationM', { infer: true }) }),
    },
  ],
  exports: [ActivityScoringService],
})
export class ScoringModule {}
