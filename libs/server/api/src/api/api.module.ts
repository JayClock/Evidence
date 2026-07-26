import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, RouterModule } from '@nestjs/core';
import { StoriesController } from './delivery.controller';
import { DiagramsController } from './diagrams.controller';
import { InboxController } from './inbox.controller';
import { InboxExtractionsController } from './inbox-extractions.controller';
import { IterationsController } from './iterations.controller';
import { LogicalEntitiesController } from './logical-entities.controller';
import { PairController } from './pair.controller';
import { InboxStoryCandidatesController } from './story-candidates.controller';
import { LogicalRelationshipsController } from './logical-relationships.controller';
import { ResourceResolver } from './resource-resolver.service';
import { SidebarController } from './sidebar.controller';
import { UserMembershipsController } from './user-memberships.controller';
import { TaskingController } from './tasking.controller';
import { UnderstandingController } from './understanding.controller';
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
  controllers: [InboxController],
})
class InboxApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [InboxExtractionsController],
})
class InboxExtractionsApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [InboxStoryCandidatesController],
})
class StoryCandidatesApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [
    IterationsController,
    UnderstandingController,
    TaskingController,
    PairController,
  ],
})
class IterationsApiModule {}

@Module({
  imports: [ApiResourcesModule],
  controllers: [StoriesController],
})
class StoriesApiModule {}

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
    InboxApiModule,
    InboxExtractionsApiModule,
    StoryCandidatesApiModule,
    IterationsApiModule,
    StoriesApiModule,
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
            path: ':workspaceId/inbox-items',
            module: InboxApiModule,
          },
          {
            path: ':workspaceId/inbox-extractions',
            module: InboxExtractionsApiModule,
          },
          {
            path: ':workspaceId/story-candidates',
            module: StoryCandidatesApiModule,
          },
          {
            path: ':workspaceId/iterations',
            module: IterationsApiModule,
          },
          {
            path: ':workspaceId/stories',
            module: StoriesApiModule,
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
