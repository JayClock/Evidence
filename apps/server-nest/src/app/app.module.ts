import { Module } from '@nestjs/common';
import { USERS } from '../domain';
import { InMemoryUsers } from '../persistent';
import { DiagramsController } from '../api/diagrams.controller';
import { LogicalEntitiesController } from '../api/logical-entities.controller';
import { LogicalRelationshipsController } from '../api/logical-relationships.controller';
import { SidebarController } from '../api/sidebar.controller';
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
    DiagramsController,
    LogicalEntitiesController,
    LogicalRelationshipsController,
    SidebarController,
  ],
  providers: [AppService, { provide: USERS, useClass: InMemoryUsers }],
})
export class AppModule {}
