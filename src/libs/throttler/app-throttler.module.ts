import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './gql-throttler.guard';
import { ThrottlerConfigFactory } from './throttler-config.factory';

/**
 * Rate limit for the whole api: ThrottlerModule with Redis storage plus a global guard
 * that also understands GraphQL. Opt out with @SkipThrottle() (e.g. /healthz).
 */
@Module({
  imports: [ThrottlerModule.forRootAsync({ useClass: ThrottlerConfigFactory })],
  providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }],
})
export class AppThrottlerModule {}
