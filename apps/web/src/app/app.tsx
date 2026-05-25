import { useMemo } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import {
  apiClient,
  getRootResource,
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
  type SidebarItem,
  type SidebarResource,
  type State,
  type UserResource,
  type WorkspaceCollectionResource,
  type WorkspaceResource,
} from '@evidence/api-client';
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  TooltipProvider,
} from '@evidence/ui';

export function App() {
  const rootResource = useMemo(() => getRootResource(), []);
  const { loading, error, resourceState } =
    useResource<RootResource>(rootResource);

  if (loading || !resourceState) {
    return (
      <FullPageStatus title="Loading Evidence" detail="Discovering API root…" />
    );
  }

  if (error) {
    return (
      <FullPageStatus title="API root unavailable" detail={error.message} />
    );
  }

  return <UserShell rootState={resourceState} />;
}

function UserShell({ rootState }: { rootState: State<RootResource> }) {
  const userResource = useMemo(
    () => rootState.follow('default-user'),
    [rootState],
  );
  const { loading, error, resourceState } =
    useResource<UserResource>(userResource);

  if (loading || !resourceState) {
    return (
      <FullPageStatus
        title="Loading user"
        detail="Following rel=default-user…"
      />
    );
  }

  if (error) {
    return (
      <FullPageStatus title="Default user unavailable" detail={error.message} />
    );
  }

  return <AppShell rootState={rootState} userState={resourceState} />;
}

function AppShell({
  rootState,
  userState,
}: {
  rootState: State<RootResource>;
  userState: State<UserResource>;
}) {
  const sidebarResource = useMemo(
    () => userState.follow('sidebar'),
    [userState],
  );
  const sidebar = useResource<SidebarResource>(sidebarResource);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          userState={userState}
          sidebarState={sidebar.resourceState}
          loading={sidebar.loading}
        />
        <SidebarInset>
          <AppHeader />
          <main className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
            <Routes>
              <Route
                path="/"
                element={
                  <Overview rootState={rootState} userState={userState} />
                }
              />
              <Route
                path="/health"
                element={<Health rootState={rootState} />}
              />
              <Route
                path="/workspaces"
                element={<WorkspacesPage userState={userState} />}
              />
              <Route path="/users/*" element={<ApiResourcePage />} />
              <Route path="/workspaces/*" element={<ApiResourcePage />} />
              <Route path="/api/*" element={<ApiResourcePage />} />
            </Routes>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">
          Evidence Workspace Console
        </span>
        <span className="truncate text-xs text-muted-foreground">
          HATEOAS navigation shell
        </span>
      </div>
    </header>
  );
}

function AppSidebar({
  userState,
  sidebarState,
  loading,
}: {
  userState: State<UserResource>;
  sidebarState?: State<SidebarResource>;
  loading: boolean;
}) {
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Evidence">
              <Link to="/">
                <div className="flex size-6 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  E
                </div>
                <span>Evidence</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {loading || !sidebarState ? (
          <SidebarLoading />
        ) : (
          sidebarState.data.sections.map((section) => (
            <SidebarGroup key={section.key}>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={item.key ?? item.label}
                    item={item}
                    pathname={location.pathname}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserMenu userState={userState} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function SidebarLoading() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Loading</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuSkeleton showIcon />
        <SidebarMenuSkeleton showIcon />
      </SidebarMenu>
    </SidebarGroup>
  );
}

function SidebarNavItem({
  item,
  pathname,
}: {
  item: SidebarItem;
  pathname: string;
}) {
  const resourcePath = item.path ?? item.href ?? '#';
  const target = sidebarItemRoute(item);
  const active = item.active ?? isPathActive(pathname, target);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.label} isActive={active}>
        <Link to={target} data-resource-path={resourcePath}>
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarUserMenu({ userState }: { userState: State<UserResource> }) {
  const user = userState.data;
  const selfHref =
    userState.links.getAll().find((link: HalLink) => link.rel === 'self')
      ?.href ?? '#';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={user.name} className="justify-start">
              <Avatar size="sm">
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{user.name}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="min-w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span className="truncate text-sm font-medium">
                  {user.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email ?? user.id}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to={toAppPathname(selfHref)}>User resource</Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
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
      items={resourceState.collection.map((diagramState) => ({
        id: diagramState.data.id,
        title: diagramState.data.title,
        detail: `${diagramState.data.type} · ${diagramState.data.status}`,
        href: diagramState.links.getAll().find((link) => link.rel === 'self')
          ?.href,
      }))}
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
      items={resourceState.collection.map((entityState) => ({
        id: entityState.data.id,
        title: entityState.data.label ?? entityState.data.name,
        detail: [entityState.data.type, entityState.data.subType]
          .filter(Boolean)
          .join(' · '),
        href: entityState.links.getAll().find((link) => link.rel === 'self')
          ?.href,
      }))}
    />
  );
}

function CollectionPanel({
  eyebrow,
  title,
  total,
  items,
}: {
  eyebrow: string;
  title: string;
  total: number;
  items: Array<{ id: string; title: string; detail: string; href?: string }>;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
          {total} total
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border bg-background p-4"
          >
            <h3 className="font-medium">
              {item.href ? (
                <Link to={toAppPathname(item.href)}>{item.title}</Link>
              ) : (
                item.title
              )}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
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

function ResourceCard({
  title,
  detail,
  links,
}: {
  title: string;
  detail: string;
  links: string[];
}) {
  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Resource</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((link) => (
          <span
            key={link}
            className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
          >
            {link}
          </span>
        ))}
      </div>
    </section>
  );
}

function StatusCard({ title, detail }: { title: string; detail: string }) {
  return (
    <section
      className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
      role="status"
    >
      <p className="text-sm font-medium text-muted-foreground">Status</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </section>
  );
}

function FullPageStatus({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <StatusCard title={title} detail={detail} />
    </main>
  );
}

function sidebarItemRoute(item: SidebarItem) {
  const href = item.href ?? item.path ?? '#';

  if (item.type === 'external') {
    return href;
  }

  return toAppPathname(href);
}

function isPathActive(pathname: string, candidate: string) {
  if (candidate === '#') {
    return false;
  }

  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

function initials(name: string) {
  const segments = name.trim().split(/\s+/).filter(Boolean);
  const first = segments[0] ?? name;
  const second = segments[1];
  const value = second
    ? `${first[0] ?? ''}${second[0] ?? ''}`
    : name.slice(0, 2);
  return value.toUpperCase();
}

export default App;
