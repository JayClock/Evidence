export function ResourceCard({
  title,
  detail,
  links,
}: {
  title: string;
  detail: string;
  links: string[];
}) {
  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">Resource</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((link) => (
          <span
            key={link}
            className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
          >
            {link}
          </span>
        ))}
      </div>
    </section>
  );
}
