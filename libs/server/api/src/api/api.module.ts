import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, RouterModule } from '@nestjs/core';
import { DiagramsController } from './diagrams.controller';
import { LogicalEntitiesController } from './logical-entities.controller';
import { LogicalRelationshipsController } from './logical-relationships.controller';
import { ResourceResolver } from './resource-resolver.service';
import { SidebarController } from './sidebar.controller';
import { UserMembershipsController } from './user-memberships.controller';
import { UsersController } from './users.controller';
import { VendorMediaTypeInterceptor } from './vendor-media.interceptor';
import { WorkspaceMembersController } from './workspace-members.controller';
import { WorkspacesController } from './workspaces.controller';

@Module({
  providers: [ResourceResolver],
  exports: [ResourceResolver],
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
  controllers: [UserMembershipsController],
})
class UserMembershipsApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [WorkspaceMembersController],
})
class WorkspaceMembersApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [WorkspacesController],
})
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
    UserMembershipsApiModule,
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
            path: ':userId/memberships',
            module: UserMembershipsApiModule,
          },
        ],
      },
      {
        path: 'workspaces',
        module: WorkspacesApiModule,
        children: [
          {
            path: ':workspaceId/members',
            module: WorkspaceMembersApiModule,
          },
          {
            path: ':workspaceId/diagram',
            module: DiagramsApiModule,
          },
          {
            path: ':workspaceId/logical-entities',
            module: LogicalEntitiesApiModule,
          },
          {
            path: ':workspaceId/logical-relationships',
            module: LogicalRelationshipsApiModule,
          },
        ],
      },
    ]),
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: VendorMediaTypeInterceptor,
    },
  ],
})
export class ApiModule {}
