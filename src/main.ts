import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { BasicConfigType } from './environment/types/basic-config.type';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = app.get(ConfigService<BasicConfigType, true>).getOrThrow('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`api listening on :${port} (POST /graphql, GET /healthz)`, 'Bootstrap');
}

void bootstrap();
