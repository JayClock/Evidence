import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { HealthResource, RootResource } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot(): RootResource {
    return this.appService.root();
  }

  @Get('health')
  getHealth(): HealthResource {
    return this.appService.health();
  }

  @Get('openapi.json')
  getOpenApi(): Record<string, unknown> {
    return this.appService.openapi();
  }
}
