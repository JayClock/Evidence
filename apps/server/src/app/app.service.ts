import { Injectable } from '@nestjs/common';
import { parse } from 'yaml';
import openapiYaml from '@evidence/server-api/openapi.yaml?raw';
import {
  apiHref,
  CurrentPrincipal,
  healthHref,
  link,
  Link,
  userHref,
} from '@evidence/server-api';

const openapiDocument = parse(openapiYaml) as Record<string, unknown>;

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
  constructor(private readonly principal: CurrentPrincipal) {}

  root(): RootResource {
    return {
      _links: {
        self: link(apiHref()),
        health: link(healthHref()),
        'current-user': link(userHref(this.principal.require().userId)),
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
    return openapiDocument;
  }
}
