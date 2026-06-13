import Link from "next/link";
import { ExternalLink, Flame } from "lucide-react";
import { notFound } from "next/navigation";

import { reactToArticle } from "@/app/news/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getArticleReactionCounts,
  getNewsArticle,
} from "@/data/racemate-repository";

export default async function NewsArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getNewsArticle(slug);

  if (!article) {
    notFound();
  }

  const reactions = await getArticleReactionCounts(article.slug);

  return (
    <AppShell>
      <PageHeading
        badge={article.source}
        description={`${article.raceTag ?? article.tags[0]?.name ?? "F1"} · ${article.time}`}
        title={article.title}
      />

      <section className="grid gap-5 py-8 lg:grid-cols-[1fr_0.42fr]">
        <article className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            {article.tags.map((tag) => (
              <Link href={`/news?tag=${tag.slug}`} key={tag.slug}>
                <Badge variant="secondary">{tag.name}</Badge>
              </Link>
            ))}
            {article.raceTag && !article.tags.some((tag) => tag.type === "race") ? (
              <Link href={article.raceFilter ? `/news?race=${article.raceFilter}` : "/news"}>
                <Badge variant="warning">{article.raceTag}</Badge>
              </Link>
            ) : null}
          </div>
          <p className="mt-5 max-w-[72ch] text-base leading-7 text-muted-foreground">
            {article.summary}
          </p>
          {article.details ? (
            <p className="mt-5 max-w-[72ch] text-sm leading-7 text-muted-foreground">
              {article.details}
            </p>
          ) : null}
          {article.keyPoints?.length ? (
            <div className="mt-6 grid gap-2">
              {article.keyPoints.map((point) => (
                <p
                  className="rounded-md border border-border/70 bg-muted px-3 py-2 text-sm text-muted-foreground"
                  key={point}
                >
                  {point}
                </p>
              ))}
            </div>
          ) : null}
          {article.href ? (
            <Button asChild className="mt-6" variant="secondary">
              <Link href={article.href} rel="noreferrer" target="_blank">
                Открыть оригинал
                <ExternalLink aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          ) : null}
        </article>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame aria-hidden="true" data-icon="inline-start" />
              Реакции
            </CardTitle>
            <CardDescription>
              Отметь материал, если он стоит внимания.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={reactToArticle} className="flex flex-wrap gap-2">
              <input name="articleId" type="hidden" value={article.slug} />
              {Object.entries(reactions).map(([reaction, count]) => (
                <Button key={reaction} name="reaction" type="submit" value={reaction} variant="secondary">
                  {reaction}
                  <Badge variant="outline">{count}</Badge>
                </Button>
              ))}
            </form>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
