import { Module } from '@nestjs/common';
import { ApiModule } from '@evidence/server-api';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InfrastructureModule } from './infrastructure.module';
import { PersistenceModule } from './persistence.module';

@Module({
  imports: [PersistenceModule, InfrastructureModule, ApiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
