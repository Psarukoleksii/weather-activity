import { BaseEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('places')
@Index('idx_places_name_country', ['nameNormalized', 'countryCode'])
@Index('idx_places_last_requested_at', ['lastRequestedAt'])
export class Place extends BaseEntity {
  /** bigint comes back from pg as a string. */
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'geoname_id', type: 'bigint', unique: true })
  geonameId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'name_normalized', type: 'text' })
  nameNormalized: string;

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode: string;

  @Column({ type: 'double precision' })
  latitude: number;

  @Column({ type: 'double precision' })
  longitude: number;

  @Column({ name: 'elevation_m', type: 'real', nullable: true })
  elevationM: number | null;

  @Column({ type: 'text' })
  timezone: string;

  /** null until the first Marine API check. */
  @Column({ name: 'has_marine_data', type: 'boolean', nullable: true })
  hasMarineData: boolean | null;

  /** Set to now() already on INSERT, otherwise the worker never sees a new place. */
  @Column({ name: 'last_requested_at', type: 'timestamptz' })
  lastRequestedAt: Date;

  /** Last successful weather sync. */
  @Column({ name: 'last_fetched_at', type: 'timestamptz', nullable: true })
  lastFetchedAt: Date | null;

  /** Last refresh attempt by the worker, successful or not. */
  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
