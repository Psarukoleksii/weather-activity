import { ActivityScore } from '../../models/activity-score.entity';
import { ACTIVITY_ORDER, Confidence, Rating } from '../../models/enums';
import { ActivityRankingDto, DayScoreDto } from './dto/activity-rankings.types';

type ScoreRow = Pick<ActivityScore, 'activity' | 'localDate' | 'applicable' | 'score' | 'rating' | 'confidence' | 'reasons'>;

/**
 * Pure ranking: for each activity sorts the days by score descending, ties by date ascending
 * (the nearer day wins), and numbers them 1..n. Always returns all four activities.
 */
export function rankDays(rows: readonly ScoreRow[]): ActivityRankingDto[] {
  return ACTIVITY_ORDER.map((activity) => {
    const own = rows.filter((r) => r.activity === activity);
    const notApplicable = own.find((r) => !r.applicable);
    if (notApplicable || own.length === 0) {
      return {
        activity,
        applicable: false,
        notApplicableReason: notApplicable?.reasons[0] ?? 'No data for this activity',
        days: [],
      };
    }
    const days: DayScoreDto[] = own
      .map((r) => ({
        rank: 0,
        date: r.localDate,
        score: r.score ?? 0,
        rating: r.rating ?? Rating.AVOID,
        confidence: r.confidence ?? Confidence.LOW,
        reasons: r.reasons ?? [],
      }))
      .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
    days.forEach((d, i) => (d.rank = i + 1));
    return { activity, applicable: true, notApplicableReason: null, days };
  });
}
