export function StatusCard({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <section
      className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
      role="status"
    >
      <p className="text-sm font-medium text-muted-foreground">Status</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </section>
  );
}

export function FullPageStatus({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <StatusCard title={title} detail={detail} />
    </main>
  );
}
