import { ActivityScore } from '../../models/activity-score.entity';
import { ActivityType, Confidence, Rating } from '../../models/enums';
import { rankDays } from './rank-days';

const row = (activity: ActivityType, localDate: string, score: number | null, applicable = true): ActivityScore =>
  ({
    activity,
    localDate,
    applicable,
    score,
    rating: score === null ? null : Rating.FAIR,
    confidence: Confidence.HIGH,
    reasons: applicable ? [] : ['No marine data for this location'],
  }) as ActivityScore;

describe('rankDays', () => {
  it('sorts days by score descending and numbers them from 1', () => {
    const scores = [40, 75, 10, 90, 55, 20, 66];
    const rows = scores.map((s, i) => row(ActivityType.OUTDOOR_SIGHTSEEING, `2026-11-${16 + i}`, s));
    const outdoor = rankDays(rows).find((a) => a.activity === ActivityType.OUTDOOR_SIGHTSEEING)!;
    expect(outdoor.days.map((d) => d.score)).toEqual([90, 75, 66, 55, 40, 20, 10]);
    expect(outdoor.days.map((d) => d.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(outdoor.days[0].date).toBe('2026-11-19');
  });

  it('breaks ties by date: the nearer day ranks higher', () => {
    const rows = [
      row(ActivityType.SKIING, '2026-11-20', 50),
      row(ActivityType.SKIING, '2026-11-17', 50),
      row(ActivityType.SKIING, '2026-11-18', 70),
      row(ActivityType.SKIING, '2026-11-16', 50),
    ];
    const skiing = rankDays(rows).find((a) => a.activity === ActivityType.SKIING)!;
    expect(skiing.days.map((d) => [d.rank, d.date])).toEqual([
      [1, '2026-11-18'],
      [2, '2026-11-16'],
      [3, '2026-11-17'],
      [4, '2026-11-20'],
    ]);
  });

  it('always returns four activities; non-applicable ones have no days and a reason', () => {
    const rows = [row(ActivityType.SURFING, '2026-11-16', null, false), row(ActivityType.INDOOR_SIGHTSEEING, '2026-11-16', 80)];
    const result = rankDays(rows);
    expect(result.map((a) => a.activity)).toEqual([
      ActivityType.SKIING,
      ActivityType.SURFING,
      ActivityType.OUTDOOR_SIGHTSEEING,
      ActivityType.INDOOR_SIGHTSEEING,
    ]);
    expect(result[1]).toEqual({
      activity: ActivityType.SURFING,
      applicable: false,
      notApplicableReason: 'No marine data for this location',
      days: [],
    });
    expect(result[3]).toMatchObject({ applicable: true, notApplicableReason: null });
    expect(result[3].days).toHaveLength(1);
  });
});
