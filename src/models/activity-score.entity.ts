import { BaseEntity, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ActivityType, Confidence, Rating } from './enums';
import { Place } from './place.entity';

export interface ScoreComponent {
  /** Raw aggregated value, null when unknown. */
  raw: number | null;
  /** Factor score 0..1, null when the raw value is unknown. */
  score: number | null;
  weight: number;
}

/**
 * Derived data: can always be recomputed from weather_hourly.
 * The rank of a day is not stored, it depends on "today" and is computed on read.
 */
@Entity('activity_scores')
export class ActivityScore extends BaseEntity {
  @PrimaryColumn({ name: 'place_id', type: 'bigint' })
  placeId: string;

  @PrimaryColumn({ type: 'varchar', length: 32 })
  activity: ActivityType;

  /** Local date in the place's time zone, 'YYYY-MM-DD'. */
  @PrimaryColumn({ name: 'local_date', type: 'date' })
  localDate: string;

  @ManyToOne(() => Place, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place?: Place;

  @Column({ type: 'boolean' })
  applicable: boolean;

  @Column({ type: 'smallint', nullable: true })
  score: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  rating: Rating | null;

  @Column({ type: 'varchar', length: 16 })
  confidence: Confidence;

  /** Human-readable reasons; for a non-applicable activity the first one explains why. */
  @Column({ type: 'jsonb' })
  reasons: string[];

  @Column({ type: 'jsonb' })
  components: Record<string, ScoreComponent>;

  @Column({ name: 'algo_version', type: 'smallint' })
  algoVersion: number;

  @Column({ name: 'computed_at', type: 'timestamptz' })
  computedAt: Date;
}

/** Plain row of activity_scores, without Active Record methods. */
export type ActivityScoreRow = Omit<ActivityScore, keyof BaseEntity | 'place'>;
