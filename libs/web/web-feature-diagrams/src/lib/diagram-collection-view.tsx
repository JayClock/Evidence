import { Link } from 'react-router-dom';
import type { DiagramCollectionResource, State } from '@evidence/api-client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@evidence/ui';

export function DiagramCollectionView({
  resourceState,
}: {
  resourceState: State<DiagramCollectionResource>;
}) {
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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
