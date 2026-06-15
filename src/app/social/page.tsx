import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { SocialFeed } from "@/components/racemate/social-feed";
import { Badge } from "@/components/ui/badge";
import {
  getSocialPosts,
  normalizeSocialPlatform,
  normalizeSocialSort,
} from "@/data/racemate-repository";
import type { SocialPlatform, SocialSort } from "@/types/racemate";

export const dynamic = "force-dynamic";

const platformFilters: { label: string; value: SocialPlatform }[] = [
  { label: "Все", value: "all" },
  { label: "X", value: "x" },
];

const sortFilters: { label: string; value: SocialSort }[] = [
  { label: "Новые", value: "new" },
  { label: "Популярные", value: "popular" },
];

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const platform = normalizeSocialPlatform(params.platform);
  const sort = normalizeSocialSort(params.sort);
  const initialResult = await getSocialPosts({ pageSize: 12, platform, sort });

  return (
    <AppShell>
      <PageHeading
        title="Соцлента"
      />

      <section className="grid gap-5 py-8 lg:grid-cols-[0.72fr_1fr] lg:items-start">
        <div className="grid gap-4 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <MessageCircle aria-hidden="true" data-icon="inline-start" />
            <h2 className="text-base font-semibold">Посты из паддока и фан-сообщества</h2>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            RaceMate показывает сохранённые X-посты из нашей базы. Если источник временно
            недоступен, старые записи остаются в ленте.
          </p>

          <FilterGroup
            label="Платформа"
            options={platformFilters}
            platform={platform}
            sort={sort}
            type="platform"
          />
          <FilterGroup
            label="Порядок"
            options={sortFilters}
            platform={platform}
            sort={sort}
            type="sort"
          />

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">X через RSSHub</Badge>
            <Badge variant="outline">Кеш RaceMate</Badge>
          </div>
        </div>

        <SocialFeed
          initialResult={initialResult}
          key={`${platform}-${sort}`}
          platform={platform}
          sort={sort}
        />
      </section>
    </AppShell>
  );
}

function FilterGroup({
  label,
  options,
  platform,
  sort,
  type,
}: {
  label: string;
  options: { label: string; value: string }[];
  platform: SocialPlatform;
  sort: SocialSort;
  type: "platform" | "sort";
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = type === "platform" ? option.value === platform : option.value === sort;
          const nextPlatform = type === "platform" ? option.value : platform;
          const nextSort = type === "sort" ? option.value : sort;
          const href = getSocialHref(nextPlatform, nextSort);

          return (
            <Link
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              href={href}
              key={option.value}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function getSocialHref(platform: string, sort: string) {
  const params = new URLSearchParams();

  if (platform !== "all") {
    params.set("platform", platform);
  }

  if (sort !== "new") {
    params.set("sort", sort);
  }

  const query = params.toString();

  return query ? `/social?${query}` : "/social";
}
