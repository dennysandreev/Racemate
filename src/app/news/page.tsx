import { Sparkles } from "lucide-react";
import Link from "next/link";

import { generateDailyDigest } from "@/app/news/digest-actions";
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
  getLatestDailyDigest,
  getNewsDriverTags,
  getNewsItems,
} from "@/data/racemate-repository";

export const dynamic = "force-dynamic";

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tag?: string; race?: string }>;
}) {
  const { page, tag, race } = await searchParams;
  const currentPage = Math.max(1, Number(page ?? 1) || 1);
  const [newsResult, digest, driverTags] = await Promise.all([
    getNewsItems({ page: currentPage, pageSize: 20, tagSlug: tag, race }),
    getLatestDailyDigest(),
    getNewsDriverTags(),
  ]);

  return (
    <AppShell>
      <PageHeading title="Новостной блог" />

      <section className="grid gap-5 py-8 lg:grid-cols-[1fr_0.42fr]">
        <div className="grid content-start gap-3">
          {tag || race ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted p-3">
              <span className="text-sm text-muted-foreground">
                Показаны новости по выбранному фильтру
              </span>
              <Button asChild size="sm" variant="secondary">
                <Link href="/news">Показать всю ленту</Link>
              </Button>
            </div>
          ) : null}

          {newsResult.items.length ? (
            newsResult.items.map((item) => (
              <Link
                className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/news/${item.slug}`}
                key={item.slug}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.source}</Badge>
                  {item.tags.map((newsTag) => (
                    <Badge key={newsTag.slug} variant="secondary">
                      {newsTag.name}
                    </Badge>
                  ))}
                  {item.raceTag && !item.tags.some((newsTag) => newsTag.type === "race") ? (
                    <Badge variant="warning">{item.raceTag}</Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
                <h2 className="mt-4 text-xl font-semibold leading-7">
                  {item.title}
                </h2>
                <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted-foreground">
                  {item.summary}
                </p>
              </Link>
            ))
          ) : (
            <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
              Свежих обработанных новостей пока нет.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Страница {newsResult.page} из {newsResult.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                asChild
                className={newsResult.page <= 1 ? "pointer-events-none opacity-50" : undefined}
                size="sm"
                variant="secondary"
              >
                <Link
                  aria-disabled={newsResult.page <= 1}
                  href={getNewsHref(newsResult.page - 1, tag, race)}
                  tabIndex={newsResult.page <= 1 ? -1 : undefined}
                >
                  Назад
                </Link>
              </Button>
              <Button
                asChild
                className={
                  newsResult.page >= newsResult.totalPages ? "pointer-events-none opacity-50" : undefined
                }
                size="sm"
                variant="secondary"
              >
                <Link
                  aria-disabled={newsResult.page >= newsResult.totalPages}
                  href={getNewsHref(newsResult.page + 1, tag, race)}
                  tabIndex={newsResult.page >= newsResult.totalPages ? -1 : undefined}
                >
                  Вперед
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles aria-hidden="true" data-icon="inline-start" />
                AI-сводка
              </CardTitle>
              <CardDescription>
                Нажми, чтобы собрать короткий дайджест из последних новостей.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {digest ? (
                <div className="rounded-md border border-border/70 bg-muted p-4">
                  <p className="font-medium">{digest.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Обновлено {digest.generatedAt}
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                    {digest.body}
                  </p>
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  Дайджеста за сегодня еще нет. RaceMate соберет его из свежих
                  новостей и сохранит для следующих открытий.
                </p>
              )}
              <form action={generateDailyDigest}>
                <Button className="w-full" type="submit" variant="secondary">
                  <Sparkles aria-hidden="true" data-icon="inline-start" />
                  Собрать сводку
                </Button>
              </form>
            </CardContent>
          </Card>

          {driverTags.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Пилоты</CardTitle>
                <CardDescription>
                  Быстро открой новости про конкретного пилота.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {driverTags.map((driverTag) => (
                  <Button
                    asChild
                    key={driverTag.slug}
                    size="sm"
                    variant={tag === driverTag.slug ? "default" : "secondary"}
                  >
                    <Link href={`/news?tag=${driverTag.slug}`}>
                      {driverTag.name}
                    </Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </section>
    </AppShell>
  );
}

function getNewsHref(page: number, tag?: string, race?: string) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  if (tag) {
    params.set("tag", tag);
  }

  if (race) {
    params.set("race", race);
  }

  const query = params.toString();

  return query ? `/news?${query}` : "/news";
}
