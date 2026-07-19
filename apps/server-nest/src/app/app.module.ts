import { Module } from '@nestjs/common';
import { ApiModule } from '@evidence/server-nest-api';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PersistenceModule } from './persistence.module';

@Module({
  imports: [PersistenceModule.forRoot(), ApiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
