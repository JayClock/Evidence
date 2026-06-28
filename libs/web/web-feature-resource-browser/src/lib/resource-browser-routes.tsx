import { Suspense, use, useMemo } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import {
  apiClient,
  normalizeContentType,
  resourceContentTypes,
  toApiPathname,
  useResource,
  type DiagramCollectionResource,
  type DiagramResource,
  type Entity,
  type Link as HalLink,
  type LogicalEntityCollectionResource,
  type LogicalEntityResource,
  type RootResource,
  type State,
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
  DiagramCollectionView,
  DiagramDetailView,
} from '@evidence/web-feature-diagrams';
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
    case resourceContentTypes.workspaces:
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
  return (
    <Card>
      <CardHeader>
        <CardDescription>Workspace</CardDescription>
        <CardTitle>{resourceState.data.title}</CardTitle>
        <CardDescription>
          {resourceState.data.description ?? 'No description'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResourceLinks links={resourceState.links.getAll()} />
      </CardContent>
    </Card>
  );
}

function ResourceLinks({ links }: { links: HalLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Badge key={`${link.rel}:${link.href}`} asChild variant="secondary">
          <Link to={link.href}>{link.rel}</Link>
        </Badge>
      ))}
    </div>
  );
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
