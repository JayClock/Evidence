import type { ReactNode } from 'react';

export type CollectionPanelItem = {
  id: string;
  title: ReactNode;
  detail: string;
};

export function CollectionPanel({
  eyebrow,
  title,
  total,
  items,
}: {
  eyebrow: string;
  title: string;
  total: number;
  items: CollectionPanelItem[];
}) {
  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
          {total} total
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border bg-background p-4"
          >
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
