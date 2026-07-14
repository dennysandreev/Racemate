import Image from "next/image";
import { Radio } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageTitle } from "@/components/racemate/page-title";
import { SocialFeed } from "@/components/racemate/social-feed";
import { SocialFilterBar } from "@/components/racemate/social-filter-bar";
import {
  StitchSegmentedLinks,
} from "@/components/racemate/stitch-primitives";
import {
  getSocialPosts,
  getSocialFilterOptions,
  getFavoriteSocialFilters,
  normalizeSocialMode,
  normalizeSocialPlatform,
} from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";
import type { SocialMode, SocialPlatform } from "@/types/racemate";

export const dynamic = "force-dynamic";

const platformFilters: { label: string; value: SocialPlatform }[] = [
  { label: "Все", value: "all" },
  { label: "X", value: "x" },
  { label: "Reddit", value: "reddit" },
  { label: "Telegram", value: "telegram" },
];

const modeFilters: { label: string; value: SocialMode }[] = [
  { label: "Главное", value: "main" },
  { label: "Моя лента", value: "mine" },
];

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{
    platform?: string;
    mode?: string;
    topic?: string;
    team?: string;
    driver?: string;
    race?: string;
  }>;
}) {
  const params = await searchParams;
  const platform = normalizeSocialPlatform(params.platform);
  const mode = normalizeSocialMode(params.mode);
  const activeFilters = {
    topic: params.topic ?? "",
    team: params.team ?? "",
    driver: params.driver ?? "",
    race: params.race ?? "",
  };
  const user = mode === "mine" ? await getSessionUser() : null;
  const [initialResult, filterOptions, favoriteFilters] = await Promise.all([
    getSocialPosts({ pageSize: 12, platform, mode, ...activeFilters }),
    getSocialFilterOptions(),
    mode === "mine"
      ? getFavoriteSocialFilters(user?.id)
      : Promise.resolve({ drivers: [], teams: [] }),
  ]);
  const favoriteLabels = [...favoriteFilters.teams, ...favoriteFilters.drivers]
    .map((item) => item.name)
    .filter((name, index, names) => names.indexOf(name) === index);
  const personalization = {
    favorites: favoriteLabels,
    state: !user ? "signed-out" as const : favoriteLabels.length ? "ready" as const : "needs-favorites" as const,
  };

  return (
    <AppShell>
      <section className="relative min-h-[11.5rem] overflow-hidden rounded-xl border border-border bg-card p-5 lg:h-40 lg:min-h-0">
        <Image
          alt=""
          className="object-cover opacity-55 saturate-50"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 72rem"
          src="/stitch/news-blog-hero-v2.webp"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/82 to-background/30" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgb(225_6_0_/_0.24),transparent_22rem)]" />
        <div className="relative z-10 flex min-h-[9rem] flex-col gap-5 lg:h-full lg:min-h-0">
          <div className="min-w-0 lg:absolute lg:left-0 lg:top-0 lg:max-w-[calc(100%-20rem)]">
            <p className="stitch-label flex items-center gap-2 text-primary">
              <Radio aria-hidden="true" className="size-3.5" />
              Соцсети · сезон {new Date().getUTCFullYear()}
            </p>
            <PageTitle className="mt-2 max-w-4xl">Социальная лента</PageTitle>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Публикации команд, пилотов и сообщества с короткой сводкой RaceMate.
            </p>
          </div>
          <div className="mt-auto self-start lg:absolute lg:right-0 lg:top-1/2 lg:mt-0 lg:-translate-y-1/2">
            <StitchSegmentedLinks
              items={modeFilters.map((option) => ({
                active: option.value === mode,
                href: getSocialHref({ mode: option.value }),
                label: option.label,
              }))}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-8 pt-5">
        <SocialFilterBar
          active={activeFilters}
          mode={mode}
          options={filterOptions}
          platform={platform}
          platforms={platformFilters}
        />

        <div className="min-w-0">
          <SocialFeed
            filters={activeFilters}
            initialResult={initialResult}
            key={`${platform}-${mode}-${Object.values(activeFilters).join("-")}`}
            mode={mode}
            personalization={personalization}
            platform={platform}
          />
        </div>
      </section>
    </AppShell>
  );
}

function getSocialHref(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value && value !== "all" && !(key === "mode" && value === "main")) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `/social?${query}` : "/social";
}
