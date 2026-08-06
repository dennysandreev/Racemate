import { ChevronDown, ListFilter, Newspaper, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AppShell } from "@/components/racemate/app-shell";
import { JsonLd } from "@/components/racemate/json-ld";
import { PageTitle } from "@/components/racemate/page-title";
import { NewsImage } from "@/components/racemate/news-image";
import { NewsQuickFilters } from "@/components/racemate/news-quick-filters";
import { MobileNewsDigestDialog } from "@/components/racemate/mobile-news-digest-dialog";
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
import { absoluteUrl, createPageMetadata } from "@/lib/seo";
import { withServerTtlCache } from "@/lib/server-ttl-cache";
import type { DailyDigest, NewsTagFilter } from "@/types/racemate";

export const dynamic = "force-dynamic";

type NewsSearchParams = {
  filter?: string;
  page?: string;
  race?: string;
  tag?: string;
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<NewsSearchParams>;
}): Promise<Metadata> {
  const query = await searchParams;
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const isFiltered = Boolean(query.filter || query.race || query.tag);
  const path = !isFiltered && page > 1 ? `/news?page=${page}` : "/news";

  return createPageMetadata({
    description:
      "Свежие новости Формулы-1 на русском: короткие сводки, главные события сезона, команды, пилоты и разборы гоночных этапов.",
    noIndex: isFiltered,
    path,
    title: page > 1 && !isFiltered
      ? `Новости Формулы-1 - страница ${page}`
      : "Новости Формулы-1 на русском",
  });
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<NewsSearchParams>;
}) {
  const { filter, page, tag, race } = await searchParams;
  const currentPage = Math.max(1, Number(page ?? 1) || 1);
  const activeFavoriteFilter = filter === "favorites";
  const userPromise = getSessionUser();
  const sidebarDataPromise = withServerTtlCache(
    "public:news:sidebar",
    60_000,
    () => Promise.all([
      getLatestDailyDigest(),
      getNewsDriverTags(),
      getNewsTeamTags(),
    ]),
    { staleWhileRevalidateMs: 5 * 60_000 },
  );
  const publicNewsPromise = activeFavoriteFilter
    ? null
    : withServerTtlCache(
        `public:news:list:${JSON.stringify([currentPage, tag ?? null, race ?? null])}`,
        60_000,
        () => getNewsItems({
          page: currentPage,
          pageSize: 21,
          tagSlug: tag,
          race,
        }),
        { staleWhileRevalidateMs: 5 * 60_000 },
      );
  const user = await userPromise;
  const favoriteFilters = activeFavoriteFilter
    ? await getFavoriteNewsFilters(user?.id)
    : { drivers: [], teams: [] };
  const favoriteTagSlugs = [
    ...favoriteFilters.drivers.map((item) => item.slug),
    ...favoriteFilters.teams.map((item) => item.slug),
  ];
  const [[digest, driverTags, teamTags], newsResult] = await Promise.all([
    sidebarDataPromise,
    publicNewsPromise ?? getNewsItems({
      page: currentPage,
      pageSize: 21,
      tagSlug: tag,
      tagSlugs: favoriteTagSlugs,
      race,
    }),
  ]);
  const [featured, ...restItems] = newsResult.items;
  const isIndexableList = !activeFavoriteFilter && !tag && !race;
  const listPath = currentPage > 1 ? `/news?page=${currentPage}` : "/news";

  return (
    <AppShell>
      {isIndexableList ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            hasPart: {
              "@type": "ItemList",
              itemListElement: newsResult.items.map((item, index) => ({
                "@type": "ListItem",
                item: absoluteUrl(`/news/${item.slug}`),
                name: item.title,
                position: (currentPage - 1) * 21 + index + 1,
              })),
            },
            inLanguage: "ru-RU",
            name: currentPage > 1
              ? `Новости Формулы-1, страница ${currentPage}`
              : "Новости Формулы-1",
            url: absoluteUrl(listPath),
          }}
        />
      ) : null}
      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-5 lg:h-40">
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
        <div className="relative grid gap-5 lg:h-full lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
          <div className="min-w-0 lg:absolute lg:left-0 lg:top-0 lg:max-w-[calc(100%-20rem)]">
            <div className="flex items-center justify-between gap-3 lg:block">
              <p className="stitch-label flex items-center gap-2 text-primary">
                <Newspaper aria-hidden="true" className="size-3.5" />
                Новости · сезон {new Date().getUTCFullYear()}
              </p>
              <MobileNewsDigestDialog digest={digest} />
            </div>
            <PageTitle className="mt-2 max-w-4xl">
              Новости Формулы-1
            </PageTitle>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Всё главное из мира Формулы-1 в одном месте, свежие новости и разбор этапов
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 [&>div]:border-foreground/15 [&>div]:bg-background/85 [&>div]:shadow-sm [&>div]:backdrop-blur-md [&_p:first-child]:text-foreground/70 [&_p:last-child]:text-xl lg:absolute lg:right-0 lg:top-1/2 lg:w-[18rem] lg:-translate-y-1/2">
            <StitchMetric label="Материалов" tone="red" value={String(newsResult.totalCount)} />
            <StitchMetric label="Страница" value={`${newsResult.page}/${newsResult.totalPages}`} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-5 lg:py-8">
        <div className="order-1 lg:hidden">
          <PersonalNewsPanel
            activeFavoriteFilter={activeFavoriteFilter}
            activeTag={tag}
            collapsible
            drivers={driverTags}
            isAuthenticated={Boolean(user)}
            teams={teamTags}
          />
        </div>

        <div className="order-2 grid content-start gap-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
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
                  alt={featured.title}
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
                  <NewsImage alt={item.title} src={item.imageUrl} />
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

        <aside className="order-3 hidden content-start gap-5 lg:order-2 lg:col-start-2 lg:row-start-1 lg:grid">
          <PersonalNewsPanel
            activeFavoriteFilter={activeFavoriteFilter}
            activeTag={tag}
            drivers={driverTags}
            isAuthenticated={Boolean(user)}
            teams={teamTags}
          />
          <DailyDigestPanel digest={digest} />
        </aside>
      </section>
    </AppShell>
  );
}

function PersonalNewsPanel({
  activeFavoriteFilter,
  activeTag,
  collapsible = false,
  drivers,
  isAuthenticated,
  teams,
}: {
  activeFavoriteFilter: boolean;
  activeTag?: string;
  collapsible?: boolean;
  drivers: NewsTagFilter[];
  isAuthenticated: boolean;
  teams: NewsTagFilter[];
}) {
  const filters = (
    <>
      <div className="flex justify-end">
        {isAuthenticated ? (
          <Button
            asChild
            className="shrink-0"
            size="sm"
            variant={activeFavoriteFilter ? "default" : "secondary"}
          >
            <Link href={activeFavoriteFilter ? "/news" : "/news?filter=favorites"}>
              Мои новости
            </Link>
          </Button>
        ) : (
          <Button asChild className="shrink-0" size="sm" variant="secondary">
            <Link href="/auth">Войти</Link>
          </Button>
        )}
      </div>
      <NewsQuickFilters activeTag={activeTag} drivers={drivers} teams={teams} />
    </>
  );

  if (collapsible) {
    return (
      <StitchPanel>
        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <ListFilter aria-hidden="true" className="size-4" />
              </span>
              <span className="font-display text-sm font-bold text-foreground">
                Персональная лента
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="grid gap-3 border-t border-border/70 p-3">
            {filters}
          </div>
        </details>
      </StitchPanel>
    );
  }

  return (
    <StitchPanel>
      <div className="grid gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <ListFilter aria-hidden="true" className="size-4" />
            </span>
            <p className="font-display text-sm font-bold text-foreground">
              Персональная лента
            </p>
          </div>
          {isAuthenticated ? (
            <Button
              asChild
              className="shrink-0"
              size="sm"
              variant={activeFavoriteFilter ? "default" : "secondary"}
            >
              <Link href={activeFavoriteFilter ? "/news" : "/news?filter=favorites"}>
                Мои новости
              </Link>
            </Button>
          ) : (
            <Button asChild className="shrink-0" size="sm" variant="secondary">
              <Link href="/auth">Войти</Link>
            </Button>
          )}
        </div>
        <NewsQuickFilters activeTag={activeTag} drivers={drivers} teams={teams} />
      </div>
    </StitchPanel>
  );
}

function DailyDigestPanel({ digest }: { digest: DailyDigest | null }) {
  return (
    <StitchPanel>
      <StitchPanelHeader icon={Sparkles} title="AI-сводка за день" />
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
  const visibleTag = item.tags.find((tag) => tag.type === "race");
  const raceTag = visibleTag?.name ?? item.raceTag;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{item.source}</Badge>
      {raceTag ? (
        <Badge variant="warning">{raceTag}</Badge>
      ) : null}
      <span className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {item.time}
      </span>
    </div>
  );
}
