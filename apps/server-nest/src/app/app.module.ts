import { Module } from '@nestjs/common';
import { USERS } from '../domain';
import { InMemoryUsers } from '../persistent';
import { UserWorkspacesController } from '../api/user-workspaces.controller';
import { UsersController } from '../api/users.controller';
import { WorkspaceMembersController } from '../api/workspace-members.controller';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [
    AppController,
    UsersController,
    UserWorkspacesController,
    WorkspaceMembersController,
  ],
  providers: [AppService, { provide: USERS, useClass: InMemoryUsers }],
})
export class AppModule {}
