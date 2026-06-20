import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { SocialFeed } from "@/components/racemate/social-feed";
import {
  StitchSegmentedLinks,
} from "@/components/racemate/stitch-primitives";
import {
  getSocialPosts,
  normalizeSocialPlatform,
} from "@/data/racemate-repository";
import type { SocialPlatform } from "@/types/racemate";

export const dynamic = "force-dynamic";

const platformFilters: { label: string; value: SocialPlatform }[] = [
  { label: "Все", value: "all" },
  { label: "X", value: "x" },
  { label: "Reddit", value: "reddit" },
];

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const params = await searchParams;
  const platform = normalizeSocialPlatform(params.platform);
  const initialResult = await getSocialPosts({ pageSize: 12, platform });

  return (
    <AppShell>
      <PageHeading title="Соцсети" />

      <section className="grid gap-5 py-8">
        <StitchSegmentedLinks
          items={platformFilters.map((option) => ({
            active: option.value === platform,
            href: getSocialHref(option.value),
            label: option.label,
          }))}
        />
        <SocialFeed initialResult={initialResult} key={platform} platform={platform} />
      </section>
    </AppShell>
  );
}

function getSocialHref(platform: string) {
  const params = new URLSearchParams();

  if (platform !== "all") {
    params.set("platform", platform);
  }

  const query = params.toString();

  return query ? `/social?${query}` : "/social";
}
