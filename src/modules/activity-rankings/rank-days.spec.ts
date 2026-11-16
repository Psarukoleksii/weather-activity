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
  it('returns days in date order whatever the scores, with rank by score', () => {
    const scores = [40, 75, 10, 90, 55, 20, 66];
    const rows = scores.map((s, i) => row(ActivityType.OUTDOOR_SIGHTSEEING, `2026-11-${16 + i}`, s));
    const outdoor = rankDays([...rows].reverse()).find((a) => a.activity === ActivityType.OUTDOOR_SIGHTSEEING)!;
    expect(outdoor.days.map((d) => d.date)).toEqual(rows.map((r) => r.localDate));
    expect(outdoor.days.map((d) => d.score)).toEqual(scores);
    expect(outdoor.days.map((d) => d.rank)).toEqual([5, 2, 7, 1, 4, 6, 3]);
  });

  it('breaks ties by date: the nearer day ranks higher', () => {
    const rows = [
      row(ActivityType.SKIING, '2026-11-20', 50),
      row(ActivityType.SKIING, '2026-11-17', 50),
      row(ActivityType.SKIING, '2026-11-18', 70),
      row(ActivityType.SKIING, '2026-11-16', 50),
    ];
    const skiing = rankDays(rows).find((a) => a.activity === ActivityType.SKIING)!;
    expect(skiing.days.map((d) => [d.date, d.rank])).toEqual([
      ['2026-11-16', 2],
      ['2026-11-17', 3],
      ['2026-11-18', 1],
      ['2026-11-20', 4],
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
