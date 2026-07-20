import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
} from 'react';
import type {
  MembershipWorkspace,
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
  path: string;
};

type SelectedProject = {
  name: string;
  source: string;
  isBrowserPreview: boolean;
};

type DirectoryInputAttributes = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

type ElectronWindow = Window & {
  evidenceDesktop?: {
    chooseDirectory?: () => Promise<string | null>;
  };
};

const directoryInputAttributes = {
  webkitdirectory: '',
  directory: '',
} as DirectoryInputAttributes;

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
                  <span>+ Add local workspace</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <CreateWorkspaceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        recentProjectSources={recentProjectSources(workspaces)}
        onCreateWorkspace={onCreateWorkspace}
      />

      <span className="sr-only">Current project: {activeSource}</span>
    </>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  recentProjectSources,
  onCreateWorkspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recentProjectSources: string[];
  onCreateWorkspace: (
    input: WorkspaceInput,
  ) => Promise<State<WorkspaceResource>>;
}) {
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const [selectedProject, setSelectedProject] =
    useState<SelectedProject | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = Boolean(selectedProject && title.trim()) && !submitting;

  function resetForm() {
    setSelectedProject(null);
    setTitle('');
    setDescription('');
    setError(null);
    setSubmitted(false);
    setSubmitting(false);
    if (directoryInputRef.current) {
      directoryInputRef.current.value = '';
    }
  }

  function selectProject(source: string, isBrowserPreview: boolean) {
    const name = basename(source);
    setSelectedProject({ name, source, isBrowserPreview });
    setError(
      isBrowserPreview
        ? 'Browser preview mode can only read the folder name. The desktop app uses the system picker for the full local source.'
        : null,
    );
    if (!title.trim()) {
      setTitle(titleFromProjectName(name));
    }
  }

  async function handleChooseProject() {
    setError(null);
    const chooseElectronDirectory = electronDirectoryPicker();
    if (chooseElectronDirectory) {
      try {
        const nativeSource = await chooseElectronDirectory();
        if (nativeSource) {
          selectProject(nativeSource, false);
        }
      } catch (nativeError) {
        setError(errorMessage(nativeError));
      }
      return;
    }

    directoryInputRef.current?.click();
  }

  function handleBrowserDirectoryChange(event: ChangeEvent<HTMLInputElement>) {
    const firstFile = event.target.files?.[0];
    if (!firstFile) {
      return;
    }

    const relativeProject = firstFile.webkitRelativePath
      ? firstFile.webkitRelativePath.split('/')[0]
      : firstFile.name;
    selectProject(relativeProject || firstFile.name, true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    if (!selectedProject || !title.trim()) {
      setError('Choose a local project and name the workspace.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const createdWorkspace = await onCreateWorkspace({
        title: title.trim(),
        description: description.trim() || null,
        status: 'active',
        path: selectedProject.source,
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
          <DialogTitle>Add local workspace</DialogTitle>
          <DialogDescription>
            Choose a local project folder. Evidence will create a workspace and
            switch to it immediately.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={submitted && !selectedProject}>
              <FieldLabel>Local project</FieldLabel>
              <Input
                ref={directoryInputRef}
                type="file"
                multiple
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleBrowserDirectoryChange}
                {...directoryInputAttributes}
              />
              <Card size="sm">
                <CardHeader>
                  <CardTitle>
                    {selectedProject?.name ?? 'Choose a project folder'}
                  </CardTitle>
                  <CardDescription>
                    {selectedProject
                      ? 'Ready to create a workspace from this local project.'
                      : 'Use the system folder picker in the desktop app.'}
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
                      <Badge variant="secondary">{selectedProject.name}</Badge>
                      {selectedProject.isBrowserPreview ? (
                        <Badge variant="secondary">Preview source</Badge>
                      ) : (
                        <Badge variant="secondary">Desktop source</Badge>
                      )}
                    </div>
                  ) : (
                    <FieldDescription>
                      The UI does not require typing a local source manually.
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
                The folder name is used as a suggestion. You can rename it.
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

            {recentProjectSources.length > 0 ? (
              <Field>
                <FieldLabel>Recent local projects</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {recentProjectSources.map((source) => (
                    <Button
                      key={source}
                      type="button"
                      variant="outline"
                      onClick={() => selectProject(source, false)}
                      disabled={submitting}
                    >
                      {basename(source)}
                    </Button>
                  ))}
                </div>
              </Field>
            ) : null}
          </FieldGroup>

          {error ? (
            <Alert
              variant={
                selectedProject?.isBrowserPreview ? 'default' : 'destructive'
              }
            >
              <AlertTitle>
                {selectedProject?.isBrowserPreview
                  ? 'Preview mode'
                  : 'Unable to continue'}
              </AlertTitle>
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

function electronDirectoryPicker(): (() => Promise<string | null>) | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const electronWindow = window as ElectronWindow;
  return electronWindow.evidenceDesktop?.chooseDirectory ?? null;
}

function recentProjectSources(workspaces: MembershipWorkspace[]) {
  const sources = workspaces
    .map((workspace) => workspace.metadata.repositoryRoot)
    .filter((source): source is string => Boolean(source));

  return [...new Set(sources)].slice(0, 3);
}

export function workspaceSourceName(workspace: MembershipWorkspace) {
  const source = workspace.metadata.repositoryRoot;
  return source ? basename(source) : 'Local project not selected';
}

export function workspaceHref(
  workspace: MembershipWorkspace,
  rel: keyof WorkspaceResource['links'] = 'self',
) {
  return workspace._links[rel]?.href;
}

function basename(source: string) {
  return source.split(/[\\/]/).filter(Boolean).pop() ?? source;
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
