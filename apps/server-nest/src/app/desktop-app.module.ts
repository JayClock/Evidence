import { Module } from '@nestjs/common';
import { ApiModule } from '@evidence/server-nest-api';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SqlitePersistenceModule } from './sqlite-persistence.module';

@Module({
  imports: [SqlitePersistenceModule, ApiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class DesktopAppModule {}
