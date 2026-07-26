import { Suspense, use, useMemo } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import {
  apiClient,
  normalizeContentType,
  resourceContentTypes,
  toApiPathname,
  useResource,
  type CodingRunCollectionResource,
  type CodingRunResource,
  type DiagramCollectionResource,
  type DiagramResource,
  type Entity,
  type InboxItemCollectionResource,
  type InboxItemResource,
  type InboxRevisionCollectionResource,
  type InboxRevisionResource,
  type Link as HalLink,
  type LogicalEntityCollectionResource,
  type LogicalEntityResource,
  type RootResource,
  type State,
  type StoryCandidateCollectionResource,
  type StoryCandidateResource,
  type StoryCollectionResource,
  type StoryResource,
  type StoryRevisionCollectionResource,
  type StoryRevisionResource,
  type UserResource,
  type WorkspaceResource,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@evidence/ui';
import {
  CodingRunCollectionView,
  CodingRunDetailView,
  StoryCandidateCollectionView,
  StoryCandidateDetailView,
  StoryCollectionView,
  StoryDetailView,
  StoryRevisionCollectionView,
  StoryRevisionDetailView,
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

export function ResourceBrowserRoutes({
  rootState,
  userState,
}: {
  rootState: State<RootResource>;
  userState: State<UserResource>;
}) {
  return (
    <Routes>
      <Route
        path="/"
        element={<Overview rootState={rootState} userState={userState} />}
      />
      <Route path="/health" element={<Health rootState={rootState} />} />
      <Route path="/workspaces" element={null} />
      <Route path="/users/*" element={<ApiResourcePage />} />
      <Route path="/workspaces/*" element={<ApiResourcePage />} />
      <Route path="/api/*" element={<ApiResourcePage />} />
    </Routes>
  );
}

function Overview({
  rootState,
  userState,
}: {
  rootState: State<RootResource>;
  userState: State<UserResource>;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Evidence</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Evidence Workspace Console
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The app shell discovers the current user from the API root and follows
          the user sidebar relation with @hateoas-ts/resource.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ResourceSummaryCard
          title="API root"
          detail="Discovered links"
          links={rootState.links.getAll().map((link: HalLink) => link.rel)}
        />
        <ResourceSummaryCard
          title={userState.data.name}
          detail={userState.data.email ?? userState.data.id}
          links={userState.links.getAll().map((link: HalLink) => link.rel)}
        />
      </div>
    </section>
  );
}

function Health({ rootState }: { rootState: State<RootResource> }) {
  const healthResource = useMemo(() => rootState.follow('health'), [rootState]);
  const { loading, error, data } = useResource(healthResource);

  if (loading) {
    return (
      <LoadingCard title="Loading health" detail="Following rel=health…" />
    );
  }

  if (error) {
    return <ErrorAlert title="Health unavailable" detail={error.message} />;
  }

  return (
    <StatusCard
      title="Server health"
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
      fallback={
        <LoadingCard title="Loading resource" detail={`GET ${apiPath}`} />
      }
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
    case resourceContentTypes.codingRuns:
      return (
        <CodingRunCollectionView
          resourceState={resourceState as State<CodingRunCollectionResource>}
        />
      );
    case resourceContentTypes.codingRun:
      return (
        <CodingRunDetailView
          resourceState={resourceState as State<CodingRunResource>}
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
  const diagramResource = useMemo(
    () => resourceState.follow('diagram'),
    [resourceState],
  );
  const diagram = useResource<DiagramResource>(diagramResource);

  if (diagram.loading) {
    return (
      <LoadingCard title="Loading diagram" detail="Following rel=diagram…" />
    );
  }

  if (diagram.error) {
    return (
      <ErrorAlert title="Diagram unavailable" detail={diagram.error.message} />
    );
  }

  if (!diagram.resourceState) {
    return (
      <LoadingCard title="Loading diagram" detail="Following rel=diagram…" />
    );
  }

  return <DiagramDetailView resourceState={diagram.resourceState} />;
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
        <CardDescription>Unsupported Resource Type</CardDescription>
        <CardTitle>{contentType || 'unknown content type'}</CardTitle>
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

function ResourceSummaryCard({
  title,
  detail,
  links,
}: {
  title: string;
  detail: string;
  links: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Resource</CardDescription>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Badge key={link} variant="secondary">
            {link}
          </Badge>
        ))}
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
        <CardDescription>Status</CardDescription>
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
