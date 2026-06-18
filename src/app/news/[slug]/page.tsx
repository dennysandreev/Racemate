import Link from "next/link";
import { ExternalLink, Flame, Newspaper, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";

import { reactToArticle } from "@/app/news/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getArticleReactionCounts,
  getNewsArticle,
  getNewsItems,
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

  const [reactions, latestNews] = await Promise.all([
    getArticleReactionCounts(article.slug),
    getNewsItems({ pageSize: 4 }),
  ]);

  return (
    <AppShell>
      <PageHeading
        badge={article.source}
        description={`${article.raceTag ?? article.tags[0]?.name ?? "F1"} · ${article.time}`}
        title={article.title}
      />

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="stitch-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{article.source}</Badge>
            <span className="text-xs text-muted-foreground">{article.time}</span>
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
          {article.details ? (
            <p className="mt-5 max-w-[72ch] text-base leading-7 text-muted-foreground">
              {article.details}
            </p>
          ) : (
            <p className="mt-5 max-w-[72ch] text-base leading-7 text-muted-foreground">
              {article.summary}
            </p>
          )}
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

        <aside className="grid content-start gap-5">
          <StitchPanel>
            <StitchPanelHeader
              icon={Sparkles}
              meta="Нажми, чтобы собрать короткий дайджест из последних новостей."
              title="AI-блок"
            />
            <div className="grid gap-3 p-4">
              <p className="text-sm leading-6 text-muted-foreground">
                RaceMate собирает короткий контекст из последних материалов, чтобы быстро понять общий фон дня.
              </p>
              <Button asChild variant="secondary">
                <Link href="/news">Открыть новости</Link>
              </Button>
            </div>
          </StitchPanel>

          <StitchPanel>
            <StitchPanelHeader
              icon={Flame}
              meta="Отметь материал, если он стоит внимания."
              title="Реакции"
            />
            <form action={reactToArticle} className="flex flex-wrap gap-2 p-4">
              <input name="articleId" type="hidden" value={article.slug} />
              {Object.entries(reactions).map(([reaction, count]) => (
                <Button key={reaction} name="reaction" type="submit" value={reaction} variant="secondary">
                  {reaction}
                  <Badge variant="outline">{count}</Badge>
                </Button>
              ))}
            </form>
          </StitchPanel>

          <StitchPanel>
            <StitchPanelHeader icon={Newspaper} title="Свежие материалы" />
            <div className="grid gap-2 p-4">
              {latestNews.items
                .filter((item) => item.slug !== article.slug)
                .slice(0, 3)
                .map((item) => (
                  <Link
                    className="rounded-md border border-border bg-background/35 p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/news/${item.slug}`}
                    key={item.slug}
                  >
                    <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{item.time}</p>
                  </Link>
                ))}
            </div>
          </StitchPanel>
        </aside>
      </section>
    </AppShell>
  );
}
