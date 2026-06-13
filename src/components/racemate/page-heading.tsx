export function PageHeading({
  description,
  title,
}: {
  badge?: string;
  description?: string;
  title: string;
}) {
  return (
    <section className="border-b border-border/70 py-8">
      <h1 className="max-w-4xl text-balance text-3xl font-semibold leading-tight sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-4 max-w-[70ch] text-base leading-7 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </section>
  );
}
