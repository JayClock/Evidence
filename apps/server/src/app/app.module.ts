import { Module } from '@nestjs/common';
import { ApiModule } from '@evidence/server-api';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthenticationModule } from './authentication.module';
import { PersistenceModule } from './persistence.module';

@Module({
  imports: [PersistenceModule, AuthenticationModule, ApiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
