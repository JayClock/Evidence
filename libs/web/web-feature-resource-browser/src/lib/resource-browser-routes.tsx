import { Suspense, use, useMemo } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  apiClient,
  normalizeContentType,
  resourceContentTypes,
  toApiPathname,
  useResource,
  type DiagramCollectionResource,
  type DiagramResource,
  type Entity,
  type InboxItemCollectionResource,
  type InboxItemResource,
  type IterationIntakeResource,
  type IterationResource,
  type KickoffResource,
  type InboxRevisionCollectionResource,
  type InboxRevisionResource,
  type LogicalEntityCollectionResource,
  type LogicalEntityResource,
  type MembershipCollectionResource,
  type PairResource,
  type RootResource,
  type State,
  type StoryCandidateCollectionResource,
  type StoryCandidateResource,
  type StoryCollectionResource,
  type StoryResource,
  type StoryRevisionCollectionResource,
  type StoryRevisionResource,
  type TaskingResource,
  type UnderstandingResource,
  type UserResource,
  type WorkspaceResource,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@evidence/ui';
import {
  IterationDetailView,
  IterationIntakeDetailView,
  KickoffDetailView,
  PairDetailView,
  StoryCandidateCollectionView,
  StoryCandidateDetailView,
  StoryCollectionView,
  StoryDetailView,
  StoryRevisionCollectionView,
  StoryRevisionDetailView,
  TaskingDetailView,
  UnderstandingDetailView,
} from '@evidence/web-feature-delivery';
import {
  DiagramCollectionView,
  DiagramDetailView,
} from '@evidence/web-feature-diagrams';
import {
  InboxCollectionView,
  InboxItemDetailView,
  InboxRevisionCollectionView,
  InboxRevisionDetailView,
} from '@evidence/web-feature-inbox';
import {
  LogicalEntityCollectionView,
  LogicalEntityDetailView,
} from '@evidence/web-feature-logical-entities';
import { WorkspaceOverviewView } from './workspace-overview';

export function ResourceBrowserRoutes({
  rootState,
  userState,
}: {
  rootState: State<RootResource>;
  userState: State<UserResource>;
}) {
  return (
    <Routes>
      <Route path="/" element={<Overview userState={userState} />} />
      <Route path="/health" element={<Health rootState={rootState} />} />
      <Route path="/workspaces" element={null} />
      <Route path="/users/*" element={<ApiResourcePage />} />
      <Route path="/workspaces/*" element={<ApiResourcePage />} />
      <Route path="/api/*" element={<ApiResourcePage />} />
    </Routes>
  );
}

function Overview({ userState }: { userState: State<UserResource> }) {
  const membershipsResource = useMemo(
    () => userState.follow('memberships'),
    [userState],
  );
  const memberships =
    useResource<MembershipCollectionResource>(membershipsResource);

  if (memberships.loading) {
    return (
      <LoadingCard
        title="正在打开工作区"
        detail="读取当前用户的 Workspace membership…"
      />
    );
  }
  if (memberships.error) {
    return (
      <ErrorAlert title="无法读取工作区" detail={memberships.error.message} />
    );
  }

  const firstMembership = memberships.resourceState?.collection[0];
  if (!firstMembership) {
    return (
      <StatusCard
        title="尚无工作区"
        detail="请使用左侧工作区切换器创建第一个 Workspace。"
      />
    );
  }
  const workspaceHref = firstMembership.getLink('workspace')?.href;
  if (!workspaceHref) {
    return (
      <ErrorAlert
        title="工作区关系不可用"
        detail="Membership 未发布 rel=workspace。"
      />
    );
  }
  return <Navigate replace to={workspaceHref} />;
}

function Health({ rootState }: { rootState: State<RootResource> }) {
  const healthResource = useMemo(() => rootState.follow('health'), [rootState]);
  const { loading, error, data } = useResource(healthResource);

  if (loading) {
    return (
      <LoadingCard title="正在检查 Server 健康状态" detail="跟随 rel=health…" />
    );
  }

  if (error) {
    return <ErrorAlert title="Server 健康状态不可用" detail={error.message} />;
  }

  return (
    <StatusCard
      title="Server 健康状态"
      detail={`${data.service}: ${data.status}`}
    />
  );
}

function ApiResourcePage() {
  const location = useLocation();
  const apiPath = toApiPathname(`${location.pathname}${location.search}`);

  return (
    <Suspense
      key={apiPath}
      fallback={<LoadingCard title="正在载入资源" detail={`GET ${apiPath}`} />}
    >
      <ApiResourcePageContent apiPath={apiPath} />
    </Suspense>
  );
}

function ApiResourcePageContent({ apiPath }: { apiPath: string }) {
  const resourcePromise = useMemo(
    () => apiClient.go<Entity>(apiPath).get(),
    [apiPath],
  );
  const resourceState = use(resourcePromise);

  return <ResourceRenderer resourceState={resourceState} />;
}

function ResourceRenderer({ resourceState }: { resourceState: State<Entity> }) {
  const contentType = normalizeContentType(
    resourceState.contentHeaders().get('content-type'),
  );

  switch (contentType) {
    case resourceContentTypes.memberships:
      return null;
    case resourceContentTypes.workspace:
      return (
        <WorkspaceDetailView
          resourceState={resourceState as State<WorkspaceResource>}
        />
      );
    case resourceContentTypes.diagrams:
      return (
        <DiagramCollectionView
          resourceState={resourceState as State<DiagramCollectionResource>}
        />
      );
    case resourceContentTypes.diagram:
      return (
        <DiagramDetailView
          resourceState={resourceState as State<DiagramResource>}
        />
      );
    case resourceContentTypes.inboxItems:
      return (
        <InboxCollectionView
          resourceState={resourceState as State<InboxItemCollectionResource>}
        />
      );
    case resourceContentTypes.inboxItem:
      return (
        <InboxItemDetailView
          resourceState={resourceState as State<InboxItemResource>}
        />
      );
    case resourceContentTypes.inboxRevisions:
      return (
        <InboxRevisionCollectionView
          resourceState={
            resourceState as State<InboxRevisionCollectionResource>
          }
        />
      );
    case resourceContentTypes.inboxRevision:
      return (
        <InboxRevisionDetailView
          resourceState={resourceState as State<InboxRevisionResource>}
        />
      );
    case resourceContentTypes.storyCandidates:
      return (
        <StoryCandidateCollectionView
          resourceState={
            resourceState as State<StoryCandidateCollectionResource>
          }
        />
      );
    case resourceContentTypes.storyCandidate:
      return (
        <StoryCandidateDetailView
          resourceState={resourceState as State<StoryCandidateResource>}
        />
      );
    case resourceContentTypes.stories:
      return (
        <StoryCollectionView
          resourceState={resourceState as State<StoryCollectionResource>}
        />
      );
    case resourceContentTypes.iteration:
      return (
        <IterationDetailView
          resourceState={resourceState as State<IterationResource>}
        />
      );
    case resourceContentTypes.iterationIntake:
      return (
        <IterationIntakeDetailView
          resourceState={resourceState as State<IterationIntakeResource>}
        />
      );
    case resourceContentTypes.kickoff:
      return (
        <KickoffDetailView
          resourceState={resourceState as State<KickoffResource>}
        />
      );
    case resourceContentTypes.understanding:
      return (
        <UnderstandingDetailView
          resourceState={resourceState as State<UnderstandingResource>}
        />
      );
    case resourceContentTypes.tasking:
      return (
        <TaskingDetailView
          resourceState={resourceState as State<TaskingResource>}
        />
      );
    case resourceContentTypes.pair:
      return (
        <PairDetailView resourceState={resourceState as State<PairResource>} />
      );
    case resourceContentTypes.story:
      return (
        <StoryDetailView
          resourceState={resourceState as State<StoryResource>}
        />
      );
    case resourceContentTypes.storyRevisions:
      return (
        <StoryRevisionCollectionView
          resourceState={
            resourceState as State<StoryRevisionCollectionResource>
          }
        />
      );
    case resourceContentTypes.storyRevision:
      return (
        <StoryRevisionDetailView
          resourceState={resourceState as State<StoryRevisionResource>}
        />
      );
    case resourceContentTypes.logicalEntities:
      return (
        <LogicalEntityCollectionView
          resourceState={
            resourceState as State<LogicalEntityCollectionResource>
          }
        />
      );
    case resourceContentTypes.logicalEntity:
      return (
        <LogicalEntityDetailView
          resourceState={resourceState as State<LogicalEntityResource>}
        />
      );
    default:
      return (
        <UnknownResourceView contentType={contentType} state={resourceState} />
      );
  }
}

function WorkspaceDetailView({
  resourceState,
}: {
  resourceState: State<WorkspaceResource>;
}) {
  return <WorkspaceOverviewView resourceState={resourceState} />;
}

function UnknownResourceView({
  contentType,
  state,
}: {
  contentType: string;
  state: State<Entity>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>不支持的资源类型</CardDescription>
        <CardTitle>{contentType || '未知 content type'}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="overflow-auto rounded-md border bg-muted p-3 text-xs">
          {JSON.stringify(
            {
              uri: state.uri,
              data: state.data,
              collectionSize: state.collection.length,
            },
            null,
            2,
          )}
        </pre>
      </CardContent>
    </Card>
  );
}

function LoadingCard({ title, detail }: { title: string; detail: string }) {
  return (
    <Card
      className="min-h-[360px] flex-1 items-center justify-center"
      role="status"
    >
      <CardContent className="flex flex-col items-center gap-3 text-center">
        <LoadingSpinner />
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{detail}</CardDescription>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSpinner() {
  return (
    <svg
      aria-hidden="true"
      className="size-6 animate-spin text-muted-foreground"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 0 1 8-8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg>
  );
}

function StatusCard({ title, detail }: { title: string; detail: string }) {
  return (
    <Card role="status">
      <CardHeader>
        <CardDescription>状态</CardDescription>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ErrorAlert({ title, detail }: { title: string; detail: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
