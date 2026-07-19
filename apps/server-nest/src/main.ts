import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DomainErrorFilter } from '@evidence/server-nest-api';
import { AppModule } from './app/app.module';
import {
  DESKTOP_SESSION_HEADER,
  isValidDesktopSession,
} from './app/desktop-session';

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

interface HttpRequest {
  header(name: string): string | undefined;
}

interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): void;
}

function installDesktopSessionGuard(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
): void {
  const expectedToken = process.env.EVIDENCE_DESKTOP_SESSION_TOKEN;
  if (!expectedToken) {
    return;
  }

  app.use((request: HttpRequest, response: HttpResponse, next: () => void) => {
    const providedToken = request.header(DESKTOP_SESSION_HEADER);
    if (!isValidDesktopSession(providedToken, expectedToken)) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: corsOrigins() });
  installDesktopSessionGuard(app);
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

void bootstrap();
