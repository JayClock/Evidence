import { Logger, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DomainErrorFilter } from '@evidence/server-api';

function corsOrigins(): string[] | true {
  const configured = process.env.EVIDENCE_CORS_ORIGINS;
  if (!configured) {
    return true;
  }
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export async function bootstrap(rootModule: Type<unknown>): Promise<void> {
  const app = await NestFactory.create(rootModule);
  app.enableCors({ origin: corsOrigins() });
  app.useGlobalFilters(new DomainErrorFilter());

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix, { exclude: ['health'] });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.EVIDENCE_HOST;
  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }

  const address = host ?? 'localhost';
  Logger.log(
    `🚀 Application is running on: http://${address}:${port}/${globalPrefix}`,
  );
}
