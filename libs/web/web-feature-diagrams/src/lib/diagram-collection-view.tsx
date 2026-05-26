import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  apiClient,
  type Action,
  type DiagramCollectionResource,
  type DiagramResource,
  type State,
} from '@evidence/api-client';
import {
  ActionForm,
  Alert,
  AlertDescription,
  Button,
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
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Collection
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Diagrams</h2>
        </div>
        <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
          {resourceState.data.page.totalElements} total
        </span>
      </div>
      {createAction ? (
        <CreateDiagramForm
          action={createAction}
          collectionUri={resourceState.uri}
        />
      ) : null}
      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resourceState.collection.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-6 text-center text-muted-foreground"
                >
                  No diagrams found.
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
                    <TableCell>{diagramState.data.type}</TableCell>
                    <TableCell>{diagramState.data.status}</TableCell>
                    <TableCell>
                      {formatDateTime(diagramState.data.createdAt)}
                    </TableCell>
                    <TableCell>
                      {formatDateTime(diagramState.data.updatedAt)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
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
  collectionUri,
}: {
  action: Action<DiagramResource>;
  collectionUri: string;
}) {
  const [formData, setFormData] = useState<FormData>(() => ({
    title: '',
    type: action.field('type')?.value ?? 'fulfillment',
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = !pending && getTitle(formData).length > 0;

  return (
    <div className="mt-4 rounded-lg border bg-muted/30 p-3">
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
          setError(null);
          try {
            await action.submit({ ...nextFormData, title });
            setFormData({
              title: '',
              type: action.field('type')?.value ?? 'fulfillment',
            });
            await apiClient
              .go<DiagramCollectionResource>(collectionUri)
              .refresh();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
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
        <div className="flex justify-end pt-2">
          <Button disabled={!canSubmit} type="submit">
            {pending ? 'Creating…' : (action.title ?? 'Create diagram')}
          </Button>
        </div>
      </ActionForm>
      {error ? (
        <Alert className="mt-3" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function getTitle(data: FormData): string {
  return typeof data.title === 'string' ? data.title.trim() : '';
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
