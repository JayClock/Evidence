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

  const activeTitle = activeWorkspace?.title ?? '尚无工作区';
  const activeSource = activeWorkspace
    ? workspaceSourceName(activeWorkspace)
    : '创建本地工作区';

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
                  <span className="text-xs text-sidebar-foreground/70">
                    工作区
                  </span>
                  <span className="truncate font-medium">{activeTitle}</span>
                </span>
                <span className="ml-auto text-sidebar-foreground/70">⌄</span>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>切换工作区</DropdownMenuLabel>
                {error ? (
                  <DropdownMenuItem disabled>工作区载入失败</DropdownMenuItem>
                ) : workspaces.length === 0 ? (
                  <DropdownMenuItem disabled>尚无工作区</DropdownMenuItem>
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
                  <span>+ 创建工作区</span>
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

      <span className="sr-only">当前项目：{activeSource}</span>
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
          ? '请选择本地项目并填写工作区名称。'
          : '请填写工作区名称。',
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
      toast.success(`已创建 ${createdWorkspace.data.title}`);
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
          <DialogTitle>创建工作区</DialogTitle>
          <DialogDescription>
            {needsLocalProject
              ? '选择供 Desktop 本地执行使用的仓库。绝对路径不会进入 renderer 或 Server。'
              : '创建 Server 工作区。本地仓库绑定仅由 Desktop 应用提供。'}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            {needsLocalProject ? (
              <Field data-invalid={submitted && !selectedProject}>
                <FieldLabel>本地项目</FieldLabel>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>
                      {selectedProject?.name ?? '选择项目目录'}
                    </CardTitle>
                    <CardDescription>
                      {selectedProject
                        ? '这里只显示项目名称和 Git revision。'
                        : 'Desktop main process 会验证目录，但不会向此界面或 Server 暴露路径。'}
                    </CardDescription>
                    <CardAction>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleChooseProject}
                        disabled={submitting}
                      >
                        选择目录
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
                        后续本地执行会在此仓库的隔离 worktree 中进行。
                      </FieldDescription>
                    )}
                  </CardContent>
                </Card>
                <FieldError>
                  {submitted && !selectedProject
                    ? '请选择本地项目目录。'
                    : null}
                </FieldError>
              </Field>
            ) : null}

            <Field data-invalid={submitted && !title.trim()}>
              <FieldLabel htmlFor="workspace-title">工作区名称</FieldLabel>
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
                  ? '目录名仅作为建议，可以修改。'
                  : '请使用 Web 与 Desktop 客户端共享的名称。'}
              </FieldDescription>
              <FieldError>
                {submitted && !title.trim() ? '请输入工作区名称。' : null}
              </FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="workspace-description">
                工作区说明
              </FieldLabel>
              <Textarea
                id="workspace-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="这个工作区需要建模哪些证据？"
                disabled={submitting}
              />
            </Field>
          </FieldGroup>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>无法继续</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              创建并切换
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
  return workspace.description?.trim() || `${workspace.status} 工作区`;
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
  return error instanceof Error ? error.message : '操作未完成。';
}
