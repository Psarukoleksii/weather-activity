import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Brackets } from 'typeorm';
import { Place } from '../../models/place.entity';
import { ForecastRefreshService } from './forecast-refresh.service';
import type { RefreshConfigType, RefreshPollerConfigType } from './refresh-config.type';

const INTERVAL_NAME = 'refresh-poller';

/**
 * Worker only. Every WORKER_POLL_INTERVAL_SECONDS picks places requested in the last 7 days
 * whose data is older than 3 h (hot: requested within 24 h) or 12 h (warm) and refreshes them.
 *
 * Registered through SchedulerRegistry (the dynamic form of @Interval) because the period comes
 * from configuration, which is not available when decorators are evaluated.
 */
@Injectable()
export class RefreshPoller implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(RefreshPoller.name);
  /** The tick in progress, so shutdown can wait for it. */
  private currentTick: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly refresh: ForecastRefreshService,
    private readonly scheduler: SchedulerRegistry,
    private readonly config: ConfigService<RefreshConfigType & RefreshPollerConfigType, true>,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.getOrThrow('refreshPoller.pollIntervalSeconds', { infer: true });
    const handle = setInterval(() => void this.tick(), seconds * 1000);
    this.scheduler.addInterval(INTERVAL_NAME, handle);
    this.logger.log(`Polling every ${seconds} s`);
    void this.tick();
  }

  /**
   * Runs before Nest closes the DataSource (TypeORM does that in onApplicationShutdown).
   * Stops new ticks, lets the place being refreshed finish and leaves the rest of the batch
   * to the next worker: those places were not marked as attempted, so nothing is delayed.
   */
  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.scheduler.doesExist('interval', INTERVAL_NAME)) this.scheduler.deleteInterval(INTERVAL_NAME);
    if (this.currentTick) {
      this.logger.log('Waiting for the current refresh to finish before shutdown');
      await this.currentTick;
    }
  }

  /** One poll. A new tick does not start while the previous one is still running or after shutdown began. */
  tick(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.currentTick) {
      this.logger.debug('Previous tick still running, skipping');
      return this.currentTick;
    }
    this.currentTick = this.runTick().finally(() => {
      this.currentTick = null;
    });
    return this.currentTick;
  }

  private async runTick(): Promise<void> {
    try {
      const due = await this.selectDuePlaces();
      if (due.length) this.logger.log(`Due places: ${due.map((d) => d.id).join(', ')}`);
      for (const place of due) {
        if (this.stopping) {
          this.logger.log(`Shutting down, ${due.length - due.indexOf(place)} place(s) left for the next run`);
          break;
        }
        await this.refreshOne(place.id, place.lastFetchedAt);
      }
    } catch (err) {
      this.logger.error(`Poll failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  /**
   * Requested within 7 days, data older than the hot (requested within 24 h) or warm interval,
   * and not attempted within WORKER_RETRY_AFTER_MINUTES. Never attempted places go first.
   */
  private selectDuePlaces(): Promise<Array<Pick<Place, 'id' | 'lastFetchedAt'>>> {
    const w = this.config.getOrThrow('refreshPoller', { infer: true });
    const r = this.config.getOrThrow('refresh', { infer: true });
    return Place.createQueryBuilder('p')
      .select(['p.id', 'p.lastFetchedAt'])
      .where("p.lastRequestedAt > now() - interval '7 days'")
      .andWhere(
        new Brackets((qb) =>
          qb.where('p.lastFetchedAt IS NULL').orWhere(
            `p.lastFetchedAt < now() - CASE
               WHEN p.lastRequestedAt > now() - interval '24 hours'
               THEN make_interval(hours => :hotHours)
               ELSE make_interval(hours => :warmHours)
             END`,
            { hotHours: r.hotRefreshHours, warmHours: r.warmRefreshHours },
          ),
        ),
      )
      .andWhere(
        new Brackets((qb) =>
          qb
            .where('p.lastAttemptAt IS NULL')
            .orWhere('p.lastAttemptAt < now() - make_interval(mins => :retryMinutes)', { retryMinutes: w.retryAfterMinutes }),
        ),
      )
      .orderBy('p.lastAttemptAt', 'ASC', 'NULLS FIRST')
      .limit(w.batchSize)
      .getMany();
  }

  private async refreshOne(id: string, lastFetchedAt: Date | null): Promise<void> {
    try {
      // Outside the refresh transaction: a failing place moves to the end of the queue
      // and is retried no more often than WORKER_RETRY_AFTER_MINUTES.
      await Place.createQueryBuilder()
        .update()
        .set({ lastAttemptAt: () => 'now()' })
        .where('id = :id', { id })
        .execute();
      await this.refresh.refreshPlace(id, { observedLastFetchedAt: lastFetchedAt, skipIfLocked: true });
    } catch (err) {
      this.logger.error(`Refresh of place ${id} failed: ${(err as Error).message}`);
    }
  }
}
