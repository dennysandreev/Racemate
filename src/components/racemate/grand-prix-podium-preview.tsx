import Link from "next/link";
import { Play } from "lucide-react";

import { DriverAvatarBadge } from "@/components/racemate/driver-avatar-badge";
import { NavigationLoadingLink } from "@/components/racemate/navigation-loading-link";
import { Button } from "@/components/ui/button";
import { getTeamAsset } from "@/data/f1-assets";
import { cn } from "@/lib/utils";
import type { GrandPrixReport, RaceReplaySummary } from "@/types/racemate";

type GrandPrixPodiumPreviewProps = {
  className?: string;
  driverSlugByName?: Record<string, string>;
  href: string;
  report: GrandPrixReport;
  replay?: RaceReplaySummary | null;
  showRaceHeading?: boolean;
};

const podiumTone: Record<number, { step: string; text: string; ring: string }> = {
  1: { ring: "#f4c95d", step: "bg-[#f4c95d] text-[#211a05]", text: "text-[#f4c95d]" },
  2: { ring: "#cbd5e1", step: "bg-[#cbd5e1] text-[#111827]", text: "text-[#cbd5e1]" },
  3: { ring: "#d48a5f", step: "bg-[#d48a5f] text-[#2a1608]", text: "text-[#d48a5f]" },
};

// Классический порядок ступеней: серебро слева, золото по центру, бронза справа.
const podiumOrder = [2, 1, 3];
const stepHeight: Record<number, string> = { 1: "h-14", 2: "h-10", 3: "h-8" };

export function GrandPrixPodiumPreview({
  className,
  driverSlugByName = {},
  href,
  report,
  replay,
  showRaceHeading = true,
}: GrandPrixPodiumPreviewProps) {
  const podium = report.results.slice(0, 3);

  return (
    <div className={cn("grid gap-4", className)}>
      {showRaceHeading ? (
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-tight">{report.raceName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{report.raceDate}</p>
        </div>
      ) : null}

      {podium.length >= 3 ? (
        <div className="grid grid-cols-3 items-end gap-2">
          {podiumOrder.map((rank) => {
            const result = podium[rank - 1];
            const team = getTeamAsset(result.team);
            const tone = podiumTone[rank];
            const isCenter = rank === 1;
            const slug = getDriverSlug(driverSlugByName, result.driver);
            const avatar = (
              <DriverAvatarBadge
                className={isCenter ? "size-16" : "size-12"}
                color={team?.color ?? tone.ring}
                name={result.driver}
                sizes={isCenter ? "4rem" : "3rem"}
                slug={slug}
              />
            );

            return (
              <div className="flex min-w-0 flex-col items-center text-center" key={`${result.position}-${result.driver}`}>
                {slug ? (
                  <Link
                    aria-label={`Открыть профиль: ${result.driver}`}
                    className="group flex w-full min-w-0 flex-col items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/drivers/${slug}`}
                    prefetch={false}
                  >
                    {avatar}
                    <span className="mt-1.5 w-full truncate text-sm font-bold leading-tight transition-colors group-hover:text-primary">
                      {getShortDriverName(result.driver)}
                    </span>
                  </Link>
                ) : (
                  <>
                    {avatar}
                    <p className="mt-1.5 w-full truncate text-sm font-bold leading-tight">
                      {getShortDriverName(result.driver)}
                    </p>
                  </>
                )}
                <p className="mt-0.5 flex min-w-0 max-w-full items-center gap-1 text-[0.65rem] font-semibold text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: team?.color ?? tone.ring }}
                  />
                  <span className="truncate">{result.team}</span>
                </p>
                <div
                  className={cn(
                    "mt-2 grid w-full place-items-center rounded-t-md",
                    stepHeight[rank],
                    tone.step,
                  )}
                >
                  <span className="font-display text-lg font-black leading-none">{rank}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-border/70 p-4 text-sm leading-6 text-muted-foreground">
          Подиум появится после синхронизации итоговой классификации.
        </p>
      )}

      <div className={cn("grid gap-2", replay ? "sm:grid-cols-2" : "")}>
        <Button asChild className="w-full justify-center text-center">
          <Link className="justify-center text-center" href={href} prefetch={false} scroll={false}>
            Открыть полный отчет
          </Link>
        </Button>
        {replay ? (
          <Button asChild className="w-full" variant="secondary">
            <NavigationLoadingLink
              href={replay.href}
              loadingLabel={`Готовим повтор Гран-при ${replay.sourceSeason}`}
              prefetch={false}
            >
              <Play aria-hidden="true" data-icon="inline-start" />
              Гран-при {replay.sourceSeason}
            </NavigationLoadingLink>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function getDriverSlug(driverSlugByName: Record<string, string>, driverName: string) {
  return driverSlugByName[normalizeDriverName(driverName)];
}

function normalizeDriverName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getShortDriverName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return parts[0] ?? fullName;
  }

  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}
