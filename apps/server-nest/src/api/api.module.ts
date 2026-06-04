import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { USERS } from '../domain';
import { InMemoryUsers } from '../persistent';
import { DiagramsController } from './diagrams.controller';
import { LogicalEntitiesController } from './logical-entities.controller';
import { LogicalRelationshipsController } from './logical-relationships.controller';
import { ResourceResolver } from './resource-resolver.service';
import { SidebarController } from './sidebar.controller';
import { UserWorkspacesController } from './user-workspaces.controller';
import { UsersController } from './users.controller';
import { WorkspaceMembersController } from './workspace-members.controller';

@Module({
  providers: [
    ResourceResolver,
    { provide: USERS, useClass: InMemoryUsers },
  ],
  exports: [ResourceResolver, USERS],
})
class ApiResourcesModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [UsersController],
})
class UsersApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [SidebarController],
})
class SidebarApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [UserWorkspacesController],
})
class UserWorkspacesApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [WorkspaceMembersController],
})
class WorkspaceMembersApiModule {}

@Module({})
class WorkspacesApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [DiagramsController],
})
class DiagramsApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [LogicalEntitiesController],
})
class LogicalEntitiesApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [LogicalRelationshipsController],
})
class LogicalRelationshipsApiModule {}

@Module({
  imports: [
    UsersApiModule,
    SidebarApiModule,
    UserWorkspacesApiModule,
    WorkspaceMembersApiModule,
    WorkspacesApiModule,
    DiagramsApiModule,
    LogicalEntitiesApiModule,
    LogicalRelationshipsApiModule,
    RouterModule.register([
      {
        path: 'users',
        module: UsersApiModule,
        children: [
          {
            path: ':userId/sidebar',
            module: SidebarApiModule,
          },
          {
            path: ':userId/workspaces',
            module: UserWorkspacesApiModule,
            children: [
              {
                path: ':workspaceId/members',
                module: WorkspaceMembersApiModule,
              },
            ],
          },
        ],
      },
      {
        path: 'workspaces/:workspaceId',
        module: WorkspacesApiModule,
        children: [
          {
            path: 'diagrams',
            module: DiagramsApiModule,
          },
          {
            path: 'logical-entities',
            module: LogicalEntitiesApiModule,
          },
          {
            path: 'logical-relationships',
            module: LogicalRelationshipsApiModule,
          },
        ],
      },
    ]),
  ],
})
export class ApiModule {}
