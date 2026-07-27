import { useState, type FormEvent } from 'react';
import type { InboxSourceInput } from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@evidence/ui';

type SourceMethod = 'manual_text' | 'local_markdown' | 'github_issues';
type DesktopBridge = NonNullable<Window['evidenceDesktop']>;
type MarkdownAdapter = NonNullable<DesktopBridge['readInboxMarkdown']>;
type GitHubAdapter = NonNullable<DesktopBridge['fetchInboxGitHubIssues']>;

export function InboxSourceDialog({
  workspaceId,
  onCapture,
}: {
  workspaceId: string | null;
  onCapture: (input: InboxSourceInput | InboxSourceInput[]) => Promise<void>;
}) {
  const bridge = window.evidenceDesktop;
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<SourceMethod>('manual_text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] =
    useState<InboxSourceInput['contentType']>('text/markdown');
  const [relativePath, setRelativePath] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ready =
    method === 'manual_text'
      ? Boolean(title.trim() && body.trim())
      : method === 'local_markdown'
        ? Boolean(
            bridge?.readInboxMarkdown && workspaceId && relativePath.trim(),
          )
        : Boolean(bridge?.fetchInboxGitHubIssues && workspaceId);

  const reset = () => {
    setMethod('manual_text');
    setTitle('');
    setBody('');
    setContentType('text/markdown');
    setRelativePath('');
    setError(null);
    setNotice(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending) return;

    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (method === 'github_issues') {
        const adapter = requiredGitHubAdapter(bridge?.fetchInboxGitHubIssues);
        const sources = await readFromWorkspaceBinding(
          bridge,
          workspaceId,
          adapter,
        );
        if (!sources) {
          setNotice('未选择本地仓库，无法导入来源。');
          return;
        }
        if (sources.length === 0) {
          setNotice('当前绑定仓库没有 open GitHub Issues。');
          return;
        }
        await onCapture(sources);
      } else if (method === 'local_markdown') {
        const adapter = requiredMarkdownAdapter(bridge?.readInboxMarkdown);
        const source = await readFromWorkspaceBinding(
          bridge,
          workspaceId,
          (id) => adapter(id, relativePath.trim()),
        );
        if (!source) {
          setNotice('未选择本地仓库，无法导入来源。');
          return;
        }
        await onCapture(source);
      } else {
        await onCapture({
          sourceKind: 'manual_text',
          externalKey: createManualSourceKey(),
          title: title.trim(),
          body,
          contentType,
        });
      }
      reset();
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          if (!nextOpen) reset();
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>添加来源</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加来源</DialogTitle>
          <DialogDescription>
            手工录入，或在 Desktop 中从仓库 Markdown、GitHub Issues
            创建不可变来源快照。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel id="inbox-source-method">添加方式</FieldLabel>
              <ToggleGroup
                aria-labelledby="inbox-source-method"
                className="w-full flex-wrap justify-start"
                type="single"
                value={method}
                variant="outline"
                onValueChange={(value) => {
                  if (value) {
                    setMethod(value as SourceMethod);
                    setError(null);
                    setNotice(null);
                  }
                }}
              >
                <ToggleGroupItem className="flex-1" value="manual_text">
                  手工录入
                </ToggleGroupItem>
                <ToggleGroupItem
                  className="flex-1"
                  disabled={!bridge?.readInboxMarkdown || !workspaceId}
                  value="local_markdown"
                >
                  仓库 Markdown
                </ToggleGroupItem>
                <ToggleGroupItem
                  className="flex-1"
                  disabled={!bridge?.fetchInboxGitHubIssues || !workspaceId}
                  value="github_issues"
                >
                  GitHub Issues
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                手工录入适用于 Web 与 Desktop；其他方式使用本地 Desktop 能力。
              </FieldDescription>
            </Field>

            {method === 'manual_text' ? (
              <>
                <Field>
                  <FieldLabel htmlFor="inbox-title">标题</FieldLabel>
                  <Input
                    id="inbox-title"
                    autoFocus
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inbox-content-type">内容类型</FieldLabel>
                  <Select
                    value={contentType}
                    onValueChange={(value) =>
                      setContentType(value as InboxSourceInput['contentType'])
                    }
                  >
                    <SelectTrigger id="inbox-content-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="text/markdown">Markdown</SelectItem>
                        <SelectItem value="text/plain">纯文本</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    原始文本会保存在不可变 Revision 中；读取时再进行渲染。
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="inbox-body">正文</FieldLabel>
                  <Textarea
                    id="inbox-body"
                    className="min-h-52 resize-y font-mono text-sm"
                    required
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </Field>
              </>
            ) : method === 'local_markdown' ? (
              <Field>
                <FieldLabel htmlFor="desktop-markdown-path">
                  仓库相对路径
                </FieldLabel>
                <Input
                  id="desktop-markdown-path"
                  autoFocus
                  placeholder="docs/request.md"
                  required
                  value={relativePath}
                  onChange={(event) => setRelativePath(event.target.value)}
                />
                <FieldDescription>
                  绝对路径及绑定仓库之外的文件会被拒绝，且不会发送到 Server。
                </FieldDescription>
              </Field>
            ) : (
              <Alert>
                <AlertDescription>
                  将从当前 Workspace 绑定仓库的 GitHub origin 读取并导入全部
                  open Issues。重复同步只会为内容变化的来源追加不可变
                  Revision。若尚未绑定，将先提示选择本地仓库；本地路径与凭据不会发送到
                  Server。
                </AlertDescription>
              </Alert>
            )}

            {notice ? (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <DialogClose asChild>
              <Button disabled={pending} type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button disabled={!ready || pending} type="submit">
              {pending
                ? method === 'github_issues'
                  ? '导入中…'
                  : '添加中…'
                : method === 'github_issues'
                  ? '导入全部 open Issues'
                  : '保存来源'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function readFromWorkspaceBinding<T>(
  bridge: DesktopBridge | undefined,
  workspaceId: string | null,
  read: (workspaceId: string) => Promise<T>,
): Promise<T | null> {
  const id = requiredWorkspaceId(workspaceId);
  try {
    return await read(id);
  } catch (caught) {
    if (!bridge || !isMissingWorkspaceBinding(caught)) throw caught;
    const selection = await bridge.chooseRepository();
    if (!selection) return null;
    await bridge.bindWorkspace(id, selection.id);
    return read(id);
  }
}

function isMissingWorkspaceBinding(error: unknown): boolean {
  return errorMessage(error).includes(
    'Workspace is not bound to a local repository',
  );
}

function requiredMarkdownAdapter(
  adapter: MarkdownAdapter | undefined,
): MarkdownAdapter {
  if (!adapter) throw new Error('Desktop Markdown adapter 不可用。');
  return adapter;
}

function requiredGitHubAdapter(
  adapter: GitHubAdapter | undefined,
): GitHubAdapter {
  if (!adapter) throw new Error('Desktop GitHub adapter 不可用。');
  return adapter;
}

function requiredWorkspaceId(value: string | null): string {
  if (!value) throw new Error('Inbox 缺少 Workspace relation。');
  return value;
}

function createManualSourceKey() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return `manual:${randomUuid ?? `${Date.now()}-${Math.random()}`}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '无法添加来源。';
}
