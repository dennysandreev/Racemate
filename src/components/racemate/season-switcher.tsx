import Link from "next/link";

import { SeasonSelect } from "@/components/racemate/season-select";
import { buildSeasonHref, type SeasonSearchParams } from "@/lib/season-navigation";
import { cn } from "@/lib/utils";

type SeasonSwitcherProps = {
  activeSeason: number;
  className?: string;
  label?: string;
  pathname: string;
  query?: SeasonSearchParams;
  seasons: number[];
};

export function SeasonSwitcher({
  activeSeason,
  className,
  label = "Сезон",
  pathname,
  query = {},
  seasons,
}: SeasonSwitcherProps) {
  const normalizedSeasons = [...new Set(seasons)].sort((a, b) => b - a);

  if (!normalizedSeasons.length) {
    return null;
  }

  if (normalizedSeasons.length === 1) {
    return (
      <div
        className={cn(
          "font-telemetry inline-flex h-11 items-center rounded-md border border-border/80 bg-background/70 px-3 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-muted-foreground backdrop-blur-sm",
          className,
        )}
      >
        {label} {normalizedSeasons[0]}
      </div>
    );
  }

  const hrefBySeason = Object.fromEntries(
    normalizedSeasons.map((season) => [season, buildSeasonHref(pathname, season, query)]),
  );

  return (
    <div className={cn("min-w-0", className)}>
      <nav
        aria-label="Сезон"
        className="hidden min-h-11 items-stretch overflow-hidden rounded-md border border-border/80 bg-background/65 p-1 shadow-sm backdrop-blur-sm sm:inline-flex"
      >
        {normalizedSeasons.map((season) => {
          const isActive = season === activeSeason;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "font-telemetry relative inline-flex min-h-11 min-w-12 items-center justify-center rounded-sm px-2.5 text-[0.68rem] font-extrabold tracking-[0.06em] outline-none transition-[background-color,color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none",
                isActive
                  ? "bg-primary text-primary-foreground shadow-[0_0_18px_rgb(225_6_0_/_0.2)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              href={hrefBySeason[season]}
              key={season}
              prefetch={false}
            >
              {season}
            </Link>
          );
        })}
      </nav>
      <SeasonSelect
        activeSeason={activeSeason}
        hrefBySeason={hrefBySeason}
        seasons={normalizedSeasons}
      />
    </div>
  );
}
