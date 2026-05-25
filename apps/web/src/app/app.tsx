import { useMemo } from 'react';
import { Route, Routes, Link } from 'react-router-dom';
import {
  getRootResource,
  useResource,
  type Link as HalLink,
  type RootResource,
  type State,
  type UserResource,
  type WorkspaceCollectionResource,
  type WorkspaceResource,
} from '@evidence/api-client';
import styles from './app.module.css';

export function App() {
  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Evidence</p>
        <h1>Evidence Workspace Console</h1>
        <p>
          Frontend now consumes the server through HAL links with
          <code> @hateoas-ts/resource</code>; navigation starts at the API root
          instead of hardcoded child URLs.
        </p>
      </header>

      <nav className={styles.navigation} aria-label="Primary">
        <Link to="/">Overview</Link>
        <Link to="/health">Health</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/health" element={<Health />} />
      </Routes>
    </main>
  );
}

function Overview() {
  const rootResource = useMemo(() => getRootResource(), []);
  const { loading, error, resourceState } =
    useResource<RootResource>(rootResource);

  if (loading) {
    return <StatusCard title="Loading API root" detail="Discovering links…" />;
  }

  if (error) {
    return <StatusCard title="API root unavailable" detail={error.message} />;
  }

  return (
    <section className={styles.grid}>
      <ResourceCard
        title="API root"
        detail="Discovered links"
        links={resourceState.links.getAll().map((link: HalLink) => link.rel)}
      />
      <DefaultUser rootState={resourceState} />
    </section>
  );
}

function Health() {
  const rootResource = useMemo(() => getRootResource(), []);
  const { loading, error, resourceState } =
    useResource<RootResource>(rootResource);

  if (loading) {
    return (
      <StatusCard title="Loading health link" detail="Discovering API root…" />
    );
  }

  if (error) {
    return <StatusCard title="Health unavailable" detail={error.message} />;
  }

  return <HealthResource rootState={resourceState} />;
}

function HealthResource({ rootState }: { rootState: State<RootResource> }) {
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

function DefaultUser({ rootState }: { rootState: State<RootResource> }) {
  const userResource = useMemo(
    () => rootState.follow('default-user'),
    [rootState],
  );
  const { loading, error, resourceState } =
    useResource<UserResource>(userResource);

  if (loading) {
    return (
      <StatusCard
        title="Loading default user"
        detail="Following rel=default-user…"
      />
    );
  }

  if (error) {
    return (
      <StatusCard title="Default user unavailable" detail={error.message} />
    );
  }

  return (
    <div className={styles.stack}>
      <ResourceCard
        title={resourceState.data.name}
        detail={resourceState.data.email ?? resourceState.data.id}
        links={resourceState.links.getAll().map((link: HalLink) => link.rel)}
      />
      <UserWorkspaces userState={resourceState} />
    </div>
  );
}

function UserWorkspaces({ userState }: { userState: State<UserResource> }) {
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

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Collection</p>
          <h2>Workspaces</h2>
        </div>
        <span className={styles.badge}>
          {resourceState.data.page.totalElements} total
        </span>
      </div>
      <div className={styles.workspaceList}>
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
    <article className={styles.workspaceItem}>
      <div>
        <h3>{workspaceState.data.title}</h3>
        <p>{workspaceState.data.description ?? 'No description'}</p>
      </div>
      <div className={styles.linkList}>
        {workspaceState.links.getAll().map((link: HalLink) => (
          <span key={`${link.rel}:${link.href}`}>{link.rel}</span>
        ))}
      </div>
    </article>
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
    <section className={styles.card}>
      <p className={styles.eyebrow}>Resource</p>
      <h2>{title}</h2>
      <p>{detail}</p>
      <div className={styles.linkList}>
        {links.map((link) => (
          <span key={link}>{link}</span>
        ))}
      </div>
    </section>
  );
}

function StatusCard({ title, detail }: { title: string; detail: string }) {
  return (
    <section className={styles.card} role="status">
      <p className={styles.eyebrow}>Status</p>
      <h2>{title}</h2>
      <p>{detail}</p>
    </section>
  );
}

export default App;
