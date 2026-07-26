import { Logger, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DomainErrorFilter } from '@evidence/server-api';
import {
  assertRemoteApiIsSecured,
  currentUserId,
} from './app/api-authorization.guard';

const JSON_BODY_LIMIT = '1280kb';

const LOCAL_CORS_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'evidence://app',
];

function corsOrigins(): string[] | true {
  const configured = process.env.EVIDENCE_CORS_ORIGINS;
  if (!configured) {
    return LOCAL_CORS_ORIGINS;
  }
  if (configured.trim() === '*') {
    return true;
  }
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export async function bootstrap(rootModule: Type<unknown>): Promise<void> {
  const host = process.env.EVIDENCE_HOST?.trim() || '127.0.0.1';
  assertRemoteApiIsSecured(host);
  currentUserId();
  const app = await NestFactory.create<NestExpressApplication>(rootModule);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.enableCors({ origin: corsOrigins() });
  app.useGlobalFilters(new DomainErrorFilter());

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix, { exclude: ['health'] });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, host);

  Logger.log(
    `🚀 Application is running on: http://${host}:${port}/${globalPrefix}`,
  );
}
