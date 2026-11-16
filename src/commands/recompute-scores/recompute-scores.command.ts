import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ForecastRefreshService } from '../../modules/forecast-refresh/forecast-refresh.service';
import { ALGO_VERSION } from '../../modules/scoring/scoring.config';
import { RecomputeScoresModule } from './recompute-scores.module';

/**
 * Recomputes activity_scores from stored weather_hourly, without Open-Meteo calls.
 *   node dist/commands/recompute-scores/recompute-scores.command.js        # places scored by another ALGO_VERSION
 *   node dist/commands/recompute-scores/recompute-scores.command.js --all  # every place with weather
 */
async function main(): Promise<void> {
  const logger = new Logger('RecomputeScores');
  const all = process.argv.includes('--all');
  const app = await NestFactory.createApplicationContext(RecomputeScoresModule, { logger: ['log', 'warn', 'error'] });
  let failed = 0;
  try {
    const refresh = app.get(ForecastRefreshService);
    const ids = await refresh.findPlacesToRecompute(all);
    logger.log(`${ids.length} place(s) to recompute (${all ? 'all' : `not at ALGO_VERSION ${ALGO_VERSION}`})`);
    for (const id of ids) {
      try {
        const rows = await refresh.recomputeScores(id);
        logger.log(`place ${id}: ${rows} score rows`);
      } catch (err) {
        failed++;
        logger.error(`place ${id} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await app.close();
  }
  if (failed) process.exitCode = 1;
}

void main();
