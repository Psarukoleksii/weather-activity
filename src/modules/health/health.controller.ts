import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('healthz')
  async health(): Promise<{ status: 'ok' }> {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok' };
  }
}
