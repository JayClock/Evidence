import { useMemo } from 'react';
import {
  getRootResource,
  useResource,
  type RootResource,
  type State,
  type UserResource,
} from '@evidence/api-client';
import { ResourceBrowserRoutes } from '@evidence/web-feature-resource-browser';
import { WebShell } from '@evidence/web-shell';
import { FullPageStatus } from '@evidence/web-ui';

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

export default App;
