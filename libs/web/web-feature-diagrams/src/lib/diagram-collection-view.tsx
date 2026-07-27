import { format, isValid, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  type Action,
  type DiagramCollectionResource,
  type DiagramResource,
  type State,
} from '@evidence/api-client';
import {
  ActionForm,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EvidenceCanvas,
  PageActions,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@evidence/ui';

type FormData = Record<string, unknown>;

export function DiagramCollectionView({
  resourceState,
}: {
  resourceState: State<DiagramCollectionResource>;
}) {
  const createAction = useCreateDiagramAction(resourceState);

  return (
    <EvidenceCanvas>
      <PageHeader>
        <PageHeaderCopy>
          <PageEyebrow>
            权威模型 · {resourceState.data.page.totalElements} 个模型图
          </PageEyebrow>
          <PageTitle>模型图</PageTitle>
          <PageDescription>
            查看工作区当前模型投影，并从 Diagram 进入节点、关系和证据引用。
          </PageDescription>
        </PageHeaderCopy>
        <PageActions>
          <Badge variant="secondary">
            {resourceState.data.page.totalElements} 个模型图
          </Badge>
          {createAction ? (
            <CreateDiagramForm
              action={createAction}
              onCreated={() => resourceState.follow('self').refresh()}
            />
          ) : null}
        </PageActions>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resourceState.collection.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Empty className="py-12">
                    <EmptyHeader>
                      <EmptyTitle>尚无模型图</EmptyTitle>
                      <EmptyDescription>
                        当前工作区还没有可查看的 Diagram。
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              resourceState.collection.map((diagramState) => {
                const href = diagramState.links
                  .getAll()
                  .find((link) => link.rel === 'self')?.href;

                return (
                  <TableRow key={diagramState.data.id}>
                    <TableCell className="font-medium">
                      {href ? (
                        <Link to={href}>{diagramState.data.title}</Link>
                      ) : (
                        diagramState.data.title
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDateTime(diagramState.data.createdAt)}
                    </TableCell>
                    <TableCell>
                      {formatDateTime(diagramState.data.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {href ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to={href}>打开</Link>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </EvidenceCanvas>
  );
}

function useCreateDiagramAction(
  resourceState: State<DiagramCollectionResource>,
) {
  return useMemo(() => {
    try {
      resourceState.action('create-diagram');
      return resourceState.action('create-diagram');
    } catch {
      return null;
    }
  }, [resourceState]);
}

function CreateDiagramForm({
  action,
  onCreated,
}: {
  action: Action<DiagramResource>;
  onCreated: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(() =>
    createInitialFormData(action),
  );
  const [pending, setPending] = useState(false);
  const canSubmit = !pending && getTitle(formData).length > 0;
  const actionTitle = action.title ?? '创建模型图';

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          if (nextOpen) {
            setFormData(createInitialFormData(action));
          }
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">{actionTitle}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionTitle}</DialogTitle>
          <DialogDescription>在当前工作区创建新的模型图。</DialogDescription>
        </DialogHeader>
        <ActionForm
          action={action}
          formData={formData}
          onFormDataChange={setFormData}
          onSubmit={async (nextFormData) => {
            const title = getTitle(nextFormData);
            if (!title || pending) {
              return;
            }

            setPending(true);
            try {
              await action.submit({
                ...nextFormData,
                title,
              });
              setFormData(createInitialFormData(action));
              setOpen(false);
              toast.success('模型图已创建', {
                description: title,
              });

              try {
                await onCreated();
              } catch (caught) {
                toast.error('模型图列表刷新失败', {
                  description: errorMessage(caught),
                });
              }
            } catch (caught) {
              toast.error('模型图创建失败', {
                description: errorMessage(caught),
              });
            } finally {
              setPending(false);
            }
          }}
          uiSchema={{
            'ui:submitButtonOptions': {
              norender: true,
            },
            'ui:options': {
              label: false,
            },
            title: {
              'ui:autofocus': true,
            },
          }}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={pending} type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button disabled={!canSubmit} type="submit">
              {pending ? '正在创建…' : actionTitle}
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function createInitialFormData(action: Action<DiagramResource>): FormData {
  return {
    title: '',
  };
}

function getTitle(data: FormData): string {
  return typeof data.title === 'string' ? data.title.trim() : '';
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function formatDateTime(value: string) {
  const date = parseISO(value);

  if (!isValid(date)) {
    return value;
  }

  return format(date, 'yyyy-MM-dd HH:mm:ss');
}
