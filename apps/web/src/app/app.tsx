import { useMemo } from 'react';
import {
  getRootResource,
  useResource,
  type RootResource,
  type State,
  type UserResource,
} from '@evidence/api-client';
import { Card, CardDescription, CardHeader, CardTitle } from '@evidence/ui';
import { ResourceBrowserRoutes } from '@evidence/web-feature-resource-browser';
import { WebShell } from '@evidence/web-shell';

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

  return <UserBootstrap rootState={resourceState} />;
}

function UserBootstrap({ rootState }: { rootState: State<RootResource> }) {
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

  return (
    <WebShell userState={resourceState}>
      <ResourceBrowserRoutes rootState={rootState} userState={resourceState} />
    </WebShell>
  );
}

function FullPageStatus({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <Card role="status">
        <CardHeader>
          <CardDescription>Status</CardDescription>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{detail}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

export default App;
