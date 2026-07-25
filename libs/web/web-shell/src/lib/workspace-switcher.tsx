import { useState, type FormEvent } from 'react';
import type {
  MembershipWorkspace,
  RepositorySelectionSummary,
  State,
  WorkspaceResource,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  Spinner,
  Textarea,
  toast,
} from '@evidence/ui';

export type WorkspaceInput = {
  title: string;
  description?: string | null;
  status?: string | null;
  localRepositorySelectionId?: string;
};

type SelectedProject = RepositorySelectionSummary;

type ElectronWindow = Window & {
  evidenceDesktop?: {
    chooseRepository?: () => Promise<RepositorySelectionSummary | null>;
  };
};

export function WorkspaceSwitcher({
  loading,
  error,
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
}: {
  loading: boolean;
  error: Error | null;
  workspaces: MembershipWorkspace[];
  activeWorkspace?: MembershipWorkspace;
  onSelectWorkspace: (workspace: MembershipWorkspace) => void;
  onCreateWorkspace: (
    input: WorkspaceInput,
  ) => Promise<State<WorkspaceResource>>;
}) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const activeWorkspaceId = activeWorkspace?.id ?? '';

  if (loading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const activeTitle = activeWorkspace?.title ?? 'No workspace';
  const activeSource = activeWorkspace
    ? workspaceSourceName(activeWorkspace)
    : 'Add a local workspace';

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                tooltip={activeTitle}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  E
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
                  <span className="text-xs text-muted-foreground">
                    Workspace
                  </span>
                  <span className="truncate font-medium">{activeTitle}</span>
                </span>
                <span className="ml-auto text-muted-foreground">⌄</span>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
                {error ? (
                  <DropdownMenuItem disabled>
                    Failed to load workspaces
                  </DropdownMenuItem>
                ) : workspaces.length === 0 ? (
                  <DropdownMenuItem disabled>
                    No workspaces yet
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuRadioGroup
                    value={activeWorkspaceId}
                    onValueChange={(workspaceId) => {
                      const workspace = workspaces.find(
                        (candidate) => candidate.id === workspaceId,
                      );
                      if (workspace) {
                        onSelectWorkspace(workspace);
                      }
                    }}
                  >
                    {workspaces.map((workspace) => (
                      <DropdownMenuRadioItem
                        key={workspace.id}
                        value={workspace.id}
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate">{workspace.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {workspaceSourceName(workspace)}
                          </span>
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setCreateDialogOpen(true)}>
                  <span>+ Create workspace</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <CreateWorkspaceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreateWorkspace={onCreateWorkspace}
      />

      <span className="sr-only">Current project: {activeSource}</span>
    </>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreateWorkspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateWorkspace: (
    input: WorkspaceInput,
  ) => Promise<State<WorkspaceResource>>;
}) {
  const chooseRepository = electronRepositoryPicker();
  const [selectedProject, setSelectedProject] =
    useState<SelectedProject | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const needsLocalProject = Boolean(chooseRepository);
  const canSubmit =
    Boolean(title.trim()) &&
    (!needsLocalProject || Boolean(selectedProject)) &&
    !submitting;

  function resetForm() {
    setSelectedProject(null);
    setTitle('');
    setDescription('');
    setError(null);
    setSubmitted(false);
    setSubmitting(false);
  }

  function selectProject(selection: RepositorySelectionSummary) {
    setSelectedProject(selection);
    setError(null);
    if (!title.trim()) {
      setTitle(titleFromProjectName(selection.name));
    }
  }

  async function handleChooseProject() {
    if (!chooseRepository) {
      return;
    }
    setError(null);
    try {
      const selection = await chooseRepository();
      if (selection) {
        selectProject(selection);
      }
    } catch (nativeError) {
      setError(errorMessage(nativeError));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    if (!title.trim() || (needsLocalProject && !selectedProject)) {
      setError(
        needsLocalProject
          ? 'Choose a local project and name the workspace.'
          : 'Name the workspace.',
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const createdWorkspace = await onCreateWorkspace({
        title: title.trim(),
        description: description.trim() || null,
        status: 'active',
        ...(selectedProject
          ? { localRepositorySelectionId: selectedProject.id }
          : {}),
      });
      toast.success(`Created ${createdWorkspace.data.title}`);
      onOpenChange(false);
      resetForm();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            {needsLocalProject
              ? 'Choose a local repository for Desktop execution. Its absolute path stays outside the renderer and Server.'
              : 'Create a Server workspace. Local repository binding is available in the Desktop app.'}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            {needsLocalProject ? (
              <Field data-invalid={submitted && !selectedProject}>
                <FieldLabel>Local project</FieldLabel>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>
                      {selectedProject?.name ?? 'Choose a project folder'}
                    </CardTitle>
                    <CardDescription>
                      {selectedProject
                        ? 'Only the project name and Git revision are visible here.'
                        : 'The Desktop main process validates the folder without exposing its path here or to the Server.'}
                    </CardDescription>
                    <CardAction>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleChooseProject}
                        disabled={submitting}
                      >
                        Choose folder
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    {selectedProject ? (
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {selectedProject.name}
                        </Badge>
                        <Badge variant="outline">
                          Git {selectedProject.headCommitSha.slice(0, 12)}
                        </Badge>
                      </div>
                    ) : (
                      <FieldDescription>
                        Local execution will use this repository in a later
                        isolated worktree.
                      </FieldDescription>
                    )}
                  </CardContent>
                </Card>
                <FieldError>
                  {submitted && !selectedProject
                    ? 'Choose a local project folder.'
                    : null}
                </FieldError>
              </Field>
            ) : null}

            <Field data-invalid={submitted && !title.trim()}>
              <FieldLabel htmlFor="workspace-title">Workspace name</FieldLabel>
              <Input
                id="workspace-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Evidence"
                aria-invalid={submitted && !title.trim()}
                disabled={submitting}
              />
              <FieldDescription>
                {selectedProject
                  ? 'The folder name is only a suggestion. You can rename it.'
                  : 'Use a name shared by Web and Desktop clients.'}
              </FieldDescription>
              <FieldError>
                {submitted && !title.trim() ? 'Enter a workspace name.' : null}
              </FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="workspace-description">
                Description
              </FieldLabel>
              <Textarea
                id="workspace-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What evidence does this workspace model?"
                disabled={submitting}
              />
            </Field>
          </FieldGroup>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to continue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              Create and switch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function electronRepositoryPicker():
  | (() => Promise<RepositorySelectionSummary | null>)
  | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const electronWindow = window as ElectronWindow;
  return electronWindow.evidenceDesktop?.chooseRepository ?? null;
}

export function workspaceSourceName(workspace: MembershipWorkspace) {
  return workspace.description?.trim() || `${workspace.status} workspace`;
}

export function workspaceHref(
  workspace: MembershipWorkspace,
  rel: keyof WorkspaceResource['links'] = 'self',
) {
  return workspace._links[rel]?.href;
}

function titleFromProjectName(name: string) {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
