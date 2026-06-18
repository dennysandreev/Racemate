import { MessageCircle } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { SocialFeed } from "@/components/racemate/social-feed";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
  StitchSegmentedLinks,
} from "@/components/racemate/stitch-primitives";
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
  { label: "Reddit", value: "reddit" },
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
      <PageHeading title="Соцсети" />

      <section className="grid gap-5 py-8 lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start">
        <aside className="grid gap-4">
          <StitchPanel>
            <StitchPanelHeader icon={MessageCircle} title="Поток из паддока" />
            <div className="grid gap-4 p-4">
              <p className="text-sm leading-6 text-muted-foreground">
                RaceMate показывает сохранённые посты из нашей базы. Если источник временно
                недоступен, старые записи остаются в ленте.
              </p>

              <div className="grid gap-2">
                <p className="stitch-label text-muted-foreground">Платформа</p>
                <StitchSegmentedLinks
                  items={platformFilters.map((option) => ({
                    active: option.value === platform,
                    href: getSocialHref(option.value, sort),
                    label: option.label,
                  }))}
                />
              </div>

              <div className="grid gap-2">
                <p className="stitch-label text-muted-foreground">Порядок</p>
                <StitchSegmentedLinks
                  items={sortFilters.map((option) => ({
                    active: option.value === sort,
                    href: getSocialHref(platform, option.value),
                    label: option.label,
                  }))}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">X через RSSHub</Badge>
                <Badge variant="outline">Reddit RSS</Badge>
                <Badge variant="outline">Кеш RaceMate</Badge>
              </div>
            </div>
          </StitchPanel>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <StitchMetric label="Режим" tone="live" value={platform === "all" ? "Все" : platform.toUpperCase()} />
            <StitchMetric label="Сортировка" value={sort === "popular" ? "Популярные" : "Новые"} />
          </div>
        </aside>

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
