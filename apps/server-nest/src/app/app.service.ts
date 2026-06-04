import { Injectable } from '@nestjs/common';
import { apiHref, healthHref, link, Link, userHref } from '../api/links';

export interface RootResource {
  _links: Record<string, Link>;
}

export interface HealthResource {
  _links: Record<string, Link>;
  status: 'ok';
  service: 'evidence-server';
}

@Injectable()
export class AppService {
  root(): RootResource {
    return {
      _links: {
        self: link(apiHref()),
        health: link(healthHref()),
        'default-user': link(userHref('desktop-user')),
      },
    };
  }

  health(): HealthResource {
    return {
      _links: { self: link(healthHref()) },
      status: 'ok',
      service: 'evidence-server',
    };
  }

  openapi(): Record<string, unknown> {
    return {
      openapi: '3.1.0',
      info: {
        title: 'Evidence API',
        version: '0.1.0',
        description: 'Contract-first API for Evidence runtime implementations.',
      },
      servers: [
        { url: 'http://127.0.0.1:3000', description: 'Nest local server' },
      ],
      paths: {},
    };
  }
}
