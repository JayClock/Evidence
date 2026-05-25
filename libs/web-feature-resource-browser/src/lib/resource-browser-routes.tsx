import { useMemo } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import {
  apiClient,
  normalizeContentType,
  resourceContentTypes,
  toApiPathname,
  toAppPathname,
  useResource,
  type DiagramCollectionResource,
  type Entity,
  type Link as HalLink,
  type LogicalEntityCollectionResource,
  type RootResource,
  type State,
  type UserResource,
  type WorkspaceCollectionResource,
  type WorkspaceResource,
} from '@evidence/api-client';
import { CollectionPanel, ResourceCard, StatusCard } from '@evidence/web-ui';

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
      <Route
        path="/workspaces"
        element={<WorkspacesPage userState={userState} />}
      />
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
        <ResourceCard
          title="API root"
          detail="Discovered links"
          links={rootState.links.getAll().map((link: HalLink) => link.rel)}
        />
        <ResourceCard
          title={userState.data.name}
          detail={userState.data.email ?? userState.data.id}
          links={userState.links.getAll().map((link: HalLink) => link.rel)}
        />
      </div>

      <WorkspacesPage userState={userState} />
    </section>
  );
}

function Health({ rootState }: { rootState: State<RootResource> }) {
  const healthResource = useMemo(() => rootState.follow('health'), [rootState]);
  const { loading, error, data } = useResource(healthResource);

  if (loading) {
    return <StatusCard title="Loading health" detail="Following rel=health…" />;
  }

  if (error) {
    return <StatusCard title="Health unavailable" detail={error.message} />;
  }

  return (
    <StatusCard
      title="Server health"
      detail={`${data.service}: ${data.status}`}
    />
  );
}

function WorkspacesPage({ userState }: { userState: State<UserResource> }) {
  const workspacesResource = useMemo(
    () => userState.follow('workspaces'),
    [userState],
  );
  const { loading, error, resourceState } =
    useResource<WorkspaceCollectionResource>(workspacesResource);

  if (loading) {
    return (
      <StatusCard
        title="Loading workspaces"
        detail="Following rel=workspaces…"
      />
    );
  }

  if (error) {
    return <StatusCard title="Workspaces unavailable" detail={error.message} />;
  }

  return <WorkspaceCollectionView resourceState={resourceState} />;
}

function WorkspaceCollectionView({
  resourceState,
}: {
  resourceState: State<WorkspaceCollectionResource>;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Collection
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Workspaces</h2>
        </div>
        <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
          {resourceState.data.page.totalElements} total
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {resourceState.collection.map(
          (workspaceState: State<WorkspaceResource>) => (
            <WorkspaceItem
              key={workspaceState.data.id}
              workspaceState={workspaceState}
            />
          ),
        )}
      </div>
    </section>
  );
}

function WorkspaceItem({
  workspaceState,
}: {
  workspaceState: State<WorkspaceResource>;
}) {
  return (
    <article className="rounded-lg border bg-background p-4">
      <div>
        <h3 className="font-medium">{workspaceState.data.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspaceState.data.description ?? 'No description'}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {workspaceState.links.getAll().map((link: HalLink) => (
          <Link
            key={`${link.rel}:${link.href}`}
            to={toAppPathname(link.href)}
            className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
          >
            {link.rel}
          </Link>
        ))}
      </div>
    </article>
  );
}

function ApiResourcePage() {
  const location = useLocation();
  const apiPath = toApiPathname(`${location.pathname}${location.search}`);
  const resource = useMemo(() => apiClient.go<Entity>(apiPath), [apiPath]);
  const { loading, error, resourceState } = useResource<Entity>(resource);

  if (loading || !resourceState) {
    return <StatusCard title="Loading resource" detail={`GET ${apiPath}`} />;
  }

  if (error) {
    return <StatusCard title="Resource unavailable" detail={error.message} />;
  }

  return <ResourceRenderer resourceState={resourceState} />;
}

function ResourceRenderer({ resourceState }: { resourceState: State<Entity> }) {
  const contentType = normalizeContentType(
    resourceState.contentHeaders().get('content-type'),
  );

  switch (contentType) {
    case resourceContentTypes.workspaces:
      return (
        <WorkspaceCollectionView
          resourceState={resourceState as State<WorkspaceCollectionResource>}
        />
      );
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
    case resourceContentTypes.logicalEntities:
      return (
        <LogicalEntityCollectionView
          resourceState={
            resourceState as State<LogicalEntityCollectionResource>
          }
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
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {resourceState.data.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {resourceState.data.description ?? 'No description'}
        </p>
      </div>
      <ResourceLinks links={resourceState.links.getAll()} />
    </section>
  );
}

function DiagramCollectionView({
  resourceState,
}: {
  resourceState: State<DiagramCollectionResource>;
}) {
  return (
    <CollectionPanel
      eyebrow="Collection"
      title="Diagrams"
      total={resourceState.data.page.totalElements}
      items={resourceState.collection.map((diagramState) => {
        const href = diagramState.links
          .getAll()
          .find((link) => link.rel === 'self')?.href;

        return {
          id: diagramState.data.id,
          title: href ? (
            <Link to={toAppPathname(href)}>{diagramState.data.title}</Link>
          ) : (
            diagramState.data.title
          ),
          detail: `${diagramState.data.type} · ${diagramState.data.status}`,
        };
      })}
    />
  );
}

function LogicalEntityCollectionView({
  resourceState,
}: {
  resourceState: State<LogicalEntityCollectionResource>;
}) {
  return (
    <CollectionPanel
      eyebrow="Collection"
      title="Logical entities"
      total={resourceState.data.page.totalElements}
      items={resourceState.collection.map((entityState) => {
        const href = entityState.links
          .getAll()
          .find((link) => link.rel === 'self')?.href;
        const title = entityState.data.label ?? entityState.data.name;

        return {
          id: entityState.data.id,
          title: href ? <Link to={toAppPathname(href)}>{title}</Link> : title,
          detail: [entityState.data.type, entityState.data.subType]
            .filter(Boolean)
            .join(' · '),
        };
      })}
    />
  );
}

function ResourceLinks({ links }: { links: HalLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={`${link.rel}:${link.href}`}
          to={toAppPathname(link.href)}
          className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
        >
          {link.rel}
        </Link>
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
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">
        Unsupported Resource Type
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">
        {contentType || 'unknown content type'}
      </h2>
      <pre className="mt-4 overflow-auto rounded-md border bg-muted p-3 text-xs">
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
    </section>
  );
}
