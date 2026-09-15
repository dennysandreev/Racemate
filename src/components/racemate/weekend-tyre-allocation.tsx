import type { RaceTyreAllocation } from "@/types/racemate";

const tyreRoles = [
  { key: "hard", label: "Hard", short: "H", ringClass: "border-zinc-100", textClass: "text-zinc-100" },
  { key: "medium", label: "Medium", short: "M", ringClass: "border-yellow-300", textClass: "text-yellow-300" },
  { key: "soft", label: "Soft", short: "S", ringClass: "border-red-500", textClass: "text-red-500" },
] as const;

export function WeekendTyreAllocation({ allocation }: { allocation: RaceTyreAllocation }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3" title="Составы шин Pirelli на этап">
      <span className="shrink-0 font-telemetry text-[0.68rem] font-bold uppercase text-muted-foreground">
        Составы шин
      </span>
      <div className="flex items-center gap-2.5">
        {tyreRoles.map((role) => (
          <span
            aria-label={`${role.label}: ${allocation[role.key]}`}
            className="inline-flex items-center gap-1.5"
            key={role.key}
          >
            <span className="grid size-8 place-items-center rounded-full bg-zinc-950 p-1 shadow-sm">
              <span className={`grid size-full place-items-center rounded-full border-2 bg-zinc-900 font-telemetry text-[0.58rem] font-black ${role.ringClass} ${role.textClass}`}>
                {role.short}
              </span>
            </span>
            <span className="font-telemetry text-xs font-black">{allocation[role.key]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
