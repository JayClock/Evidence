import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@evidence/server-domain';
import { DomainErrorFilter } from './domain-error.filter';

describe('DomainErrorFilter', () => {
  it('maps a forbidden domain decision to HTTP 403', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as ArgumentsHost;

    new DomainErrorFilter().catch(
      DomainError.forbidden('workspace write denied'),
      host,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'workspace write denied' });
  });
});
