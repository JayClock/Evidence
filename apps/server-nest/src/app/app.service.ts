import { Injectable } from '@nestjs/common';
import { apiHref, healthHref, link, Link, userHref } from '../api/links';

export interface RootResource {
  _links: Record<string, Link>;
}

export interface HealthResource {
  _links: Record<string, Link>;
  status: 'ok';
  service: 'evidence-server-nest';
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
      service: 'evidence-server-nest',
    };
  }
}
