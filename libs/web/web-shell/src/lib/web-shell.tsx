import { useCallback, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useResource,
  type SidebarResource,
  type State,
  type UserResource,
  type WorkspaceCollectionResource,
  type WorkspaceResource,
  type WorkspaceState,
} from '@evidence/api-client';
import {
  SidebarInset,
  SidebarProvider,
  Toaster,
  TooltipProvider,
} from '@evidence/ui';

import { AppSidebar } from './app-sidebar';
import { AppTopbar } from './app-topbar';
import { createShellNavigation, workspaceIdFromPath } from './navigation';
import { workspaceHref, type WorkspaceInput } from './workspace-switcher';

export function WebShell({
  userState,
  onSignOut,
  children,
}: {
  userState: State<UserResource>;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarResource = useMemo(
    () => userState.follow('sidebar'),
    [userState],
  );
  const workspacesResource = useMemo(
    () => userState.follow('workspaces'),
    [userState],
  );
  const createWorkspaceResource = useMemo(
    () => userState.follow('create-workspace'),
    [userState],
  );
  const sidebar = useResource<SidebarResource>(sidebarResource);
  const workspaces =
    useResource<WorkspaceCollectionResource>(workspacesResource);
  const workspaceStates: WorkspaceState[] =
    workspaces.resourceState?.collection ?? [];
  const routeWorkspaceId = workspaceIdFromPath(location.pathname);
  const activeWorkspace =
    workspaceStates.find(
      (workspace) => workspace.data.id === routeWorkspaceId,
    ) ?? workspaceStates[0];
  const currentLocation = `${location.pathname}${location.search}`;
  const navigation = createShellNavigation(
    sidebar.resourceState,
    activeWorkspace,
    currentLocation,
  );

  const selectWorkspace = useCallback(
    (workspace: WorkspaceState) => {
      const href = workspaceHref(workspace);
      if (href) navigate(href);
    },
    [navigate],
  );

  const createWorkspace = useCallback(
    async (input: WorkspaceInput) => {
      const { localRepositorySelectionId, ...serverInput } = input;
      const createdWorkspace = (await createWorkspaceResource.post({
        data: serverInput,
      })) as State<WorkspaceResource>;

      try {
        if (localRepositorySelectionId) {
          const bindWorkspace = window.evidenceDesktop?.bindWorkspace;
          if (!bindWorkspace) {
            throw new Error('本地仓库只能由 Desktop 应用绑定。');
          }
          await bindWorkspace(
            createdWorkspace.data.id,
            localRepositorySelectionId,
          );
        }
      } catch (error) {
        await createdWorkspace
          .follow('self')
          .delete()
          .catch(() => undefined);
        throw error;
      }

      await workspaces.resource.refresh();
      const href = createdWorkspace.getLink('self')?.href;
      if (href) navigate(href);
      return createdWorkspace;
    },
    [createWorkspaceResource, workspaces.resource, navigate],
  );

  return (
    <TooltipProvider>
      <Toaster position="top-center" />
      <SidebarProvider className="h-svh bg-sidebar">
        <a
          className="sr-only top-2 left-2 rounded-md bg-card px-3 py-2 text-sm font-medium shadow focus:fixed focus:not-sr-only"
          href="#main-content"
        >
          跳到主要内容
        </a>
        <AppSidebar
          activeWorkspace={activeWorkspace}
          navigation={navigation}
          navigationLoading={sidebar.loading}
          userState={userState}
          workspaces={workspaceStates}
          workspacesError={workspaces.error}
          workspacesLoading={workspaces.loading}
          onCreateWorkspace={createWorkspace}
          onSelectWorkspace={selectWorkspace}
          onSignOut={onSignOut}
        />
        <SidebarInset className="h-[calc(100svh-1rem)] min-w-0 overflow-hidden border border-sidebar-border bg-card">
          <AppTopbar navigation={navigation} />
          <div
            className="min-h-0 w-full flex-1 overflow-hidden"
            id="main-content"
            tabIndex={-1}
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default WebShell;
