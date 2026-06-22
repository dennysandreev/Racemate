import { Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { AppShell } from "@/components/racemate/app-shell";
import { NewsImage } from "@/components/racemate/news-image";
import { NewsQuickFilters } from "@/components/racemate/news-quick-filters";
import { NewsTagBadge } from "@/components/racemate/news-tag-badge";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getFavoriteNewsFilters,
  getLatestDailyDigest,
  getNewsDriverTags,
  getNewsItems,
  getNewsTeamTags,
} from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string; tag?: string; race?: string }>;
}) {
  const { filter, page, tag, race } = await searchParams;
  const currentPage = Math.max(1, Number(page ?? 1) || 1);
  const user = await getSessionUser();
  const [favoriteFilters, digest, driverTags, teamTags] = await Promise.all([
    getFavoriteNewsFilters(user?.id),
    getLatestDailyDigest(),
    getNewsDriverTags(),
    getNewsTeamTags(),
  ]);
  const favoriteTagSlugs = [
    ...favoriteFilters.drivers.map((item) => item.slug),
    ...favoriteFilters.teams.map((item) => item.slug),
  ];
  const activeFavoriteFilter = filter === "favorites";
  const newsResult = await getNewsItems({
    page: currentPage,
    pageSize: 21,
    tagSlug: tag,
    tagSlugs: activeFavoriteFilter ? favoriteTagSlugs : undefined,
    race,
  });
  const [featured, ...restItems] = newsResult.items;

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-7">
        <Image
          alt=""
          className="object-cover opacity-80"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 72rem"
          src="/stitch/news-blog-hero-v2.webp"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/76 to-background/18" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255_/_0.06),transparent_44%)]" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div className="min-w-0">
            <h1 className="font-display max-w-4xl text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
              Новостной блог
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Последние материалы Формулы 1 без лишнего шума: новости, контекст этапов и быстрые фильтры по любимым пилотам и командам.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StitchMetric label="Материалов" tone="red" value={String(newsResult.totalCount)} />
            <StitchMetric label="Страница" value={`${newsResult.page}/${newsResult.totalPages}`} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-5">
          <div className="stitch-panel flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Персональная лента
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Новости по пилотам и командам, которые ты отметил в профиле.
              </p>
            </div>
            {user ? (
              <Button
                asChild
                size="sm"
                variant={activeFavoriteFilter ? "default" : "secondary"}
              >
                <Link href={activeFavoriteFilter ? "/news" : "/news?filter=favorites"}>
                  Мои новости
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="secondary">
                <Link href="/auth">Войти</Link>
              </Button>
            )}
            <NewsQuickFilters activeTag={tag} drivers={driverTags} teams={teamTags} />
          </div>

          {tag || race || activeFavoriteFilter ? (
            <div className="stitch-panel flex flex-wrap items-center justify-between gap-3 p-3">
              <span className="text-sm text-muted-foreground">
                Показаны новости по выбранному фильтру
              </span>
              <Button asChild size="sm" variant="secondary">
                <Link href="/news">Показать всю ленту</Link>
              </Button>
            </div>
          ) : null}

          {featured ? (
            <Link
              className="group stitch-panel relative grid min-h-[11rem] content-end overflow-hidden p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[13rem] sm:p-5"
              href={`/news/${featured.slug}`}
              prefetch={false}
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgb(255_255_255_/_0.07),transparent_44%),linear-gradient(180deg,transparent,rgb(0_0_0_/_0.18))]" />
              <div className="relative">
                <NewsMeta item={featured} />
                <h2 className="mt-4 max-w-3xl text-balance font-display text-2xl font-extrabold leading-tight tracking-[-0.04em] transition-colors group-hover:text-primary sm:text-3xl">
                  {featured.title}
                </h2>
                <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted-foreground">
                  {featured.summary}
                </p>
                <NewsImage
                  alt=""
                  className="relative mt-4 aspect-video overflow-hidden rounded-lg border border-border/70 bg-muted"
                  priority
                  src={featured.imageUrl}
                />
              </div>
            </Link>
          ) : (
            <div className="stitch-panel p-5 text-sm text-muted-foreground">
              Свежих обработанных новостей пока нет.
            </div>
          )}

          {restItems.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {restItems.map((item) => (
              <Link
                className="group stitch-panel grid content-between gap-4 p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/news/${item.slug}`}
                key={item.slug}
                prefetch={false}
              >
                <NewsMeta item={item} />
                <h2 className="line-clamp-3 text-lg font-semibold leading-6 transition-colors group-hover:text-primary">
                  {item.title}
                </h2>
                <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {item.summary}
                </p>
                <NewsImage alt="" src={item.imageUrl} />
              </Link>
              ))}
            </div>
          ) : null}

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
                  href={getNewsHref(newsResult.page - 1, { filter, race, tag })}
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
                  href={getNewsHref(newsResult.page + 1, { filter, race, tag })}
                  tabIndex={newsResult.page >= newsResult.totalPages ? -1 : undefined}
                >
                  Вперед
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-5">
          <StitchPanel>
            <StitchPanelHeader
              icon={Sparkles}
              title="AI-сводка за день"
            />
            <div className="p-4">
              {digest ? (
                <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {digest.body}
                </p>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  Сводка за прошедшие сутки появится после 12:00 UTC.
                </p>
              )}
            </div>
          </StitchPanel>
        </aside>
      </section>
    </AppShell>
  );
}

function getNewsHref(
  page: number,
  filters: { filter?: string; tag?: string; race?: string },
) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  if (filters.filter) {
    params.set("filter", filters.filter);
  }

  if (filters.tag) {
    params.set("tag", filters.tag);
  }

  if (filters.race) {
    params.set("race", filters.race);
  }

  const query = params.toString();

  return query ? `/news?${query}` : "/news";
}

function NewsMeta({
  item,
}: {
  item: {
    raceTag?: string;
    source: string;
    tags: { name: string; slug: string; type?: string }[];
    time: string;
  };
}) {
  const visibleTag = item.tags.find((tag) => tag.type === "team") ?? item.tags.find((tag) => tag.type === "race");
  const raceTag = visibleTag?.name ?? item.raceTag;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{item.source}</Badge>
      {visibleTag ? (
        <NewsTagBadge tag={visibleTag} />
      ) : raceTag ? (
        <Badge variant="warning">{raceTag}</Badge>
      ) : null}
      <span className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {item.time}
      </span>
    </div>
  );
}
