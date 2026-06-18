export function PageHeading({
  description,
  title,
}: {
  badge?: string;
  description?: string;
  title: string;
}) {
  return (
    <section className="border-b border-border py-7">
      <h1 className="font-display max-w-4xl text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
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
