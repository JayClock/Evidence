import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiModule } from '@evidence/server-api';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiAuthorizationGuard } from './api-authorization.guard';
import { PersistenceModule } from './persistence.module';

@Module({
  imports: [PersistenceModule, ApiModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ApiAuthorizationGuard,
    },
  ],
})
export class AppModule {}
