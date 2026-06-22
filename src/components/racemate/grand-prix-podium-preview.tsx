import Link from "next/link";
import { Trophy } from "lucide-react";

import { TeamColorBar } from "@/components/racemate/team-color";
import { Button } from "@/components/ui/button";
import { getTeamAsset } from "@/data/f1-assets";
import { cn } from "@/lib/utils";
import type { GrandPrixReport } from "@/types/racemate";

type GrandPrixPodiumPreviewProps = {
  className?: string;
  href: string;
  report: GrandPrixReport;
};

export function GrandPrixPodiumPreview({
  className,
  href,
  report,
}: GrandPrixPodiumPreviewProps) {
  const podium = report.results.slice(0, 3);

  return (
    <div className={cn("grid gap-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-tight">{report.raceName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{report.raceDate}</p>
        </div>
        <Trophy aria-hidden="true" className="size-6 shrink-0 text-primary" />
      </div>

      {podium.length >= 3 ? (
        <div className="grid gap-2">
          {podium.map((result, index) => {
            const team = getTeamAsset(result.team);
            const medalClassName =
              index === 0
                ? "border-[#f4c95d]/50 bg-[#f4c95d]/10 text-[#f4c95d]"
                : index === 1
                  ? "border-slate-200/35 bg-slate-200/10 text-slate-100"
                  : "border-[#d48a5f]/45 bg-[#d48a5f]/10 text-[#d48a5f]";

            return (
              <div
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 rounded-md border border-border bg-muted/20 p-3"
                key={`${result.position}-${result.driver}`}
              >
                <span
                  className={`grid h-10 place-items-center rounded-md border font-telemetry text-xs font-black ${medalClassName}`}
                >
                  P{index + 1}
                </span>
                <span className="flex min-w-0 items-center gap-3">
                  <TeamColorBar className="h-8 w-1.5" color={team?.color} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{result.driver}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {result.team}
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-border/70 p-4 text-sm leading-6 text-muted-foreground">
          Подиум появится после синхронизации итоговой классификации.
        </p>
      )}

      <Button asChild className="w-full">
        <Link href={href} prefetch={false} scroll={false}>
          Открыть полный отчет
        </Link>
      </Button>
    </div>
  );
}
