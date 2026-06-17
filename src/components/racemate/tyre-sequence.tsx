import type { TyreStint } from "@/types/racemate";

const tyreMeta: Record<string, { label: string; short: string; className: string }> = {
  SOFT: {
    label: "Soft",
    short: "S",
    className: "border-red-400 bg-red-500 text-white",
  },
  MEDIUM: {
    label: "Medium",
    short: "M",
    className: "border-yellow-300 bg-yellow-300 text-black",
  },
  HARD: {
    label: "Hard",
    short: "H",
    className: "border-zinc-200 bg-zinc-50 text-black",
  },
  INTERMEDIATE: {
    label: "Intermediate",
    short: "I",
    className: "border-emerald-300 bg-emerald-500 text-white",
  },
  WET: {
    label: "Wet",
    short: "W",
    className: "border-sky-300 bg-sky-500 text-white",
  },
};

export function TyreSequence({ tyres }: { tyres?: TyreStint[] | null }) {
  const sequence = (tyres ?? []).filter((tyre) => tyre.compound);

  if (!sequence.length) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {sequence.map((tyre, index) => {
        const compound = tyre.compound.toUpperCase();
        const meta = tyreMeta[compound] ?? {
          label: compound,
          short: compound.slice(0, 1) || "?",
          className: "border-border bg-muted text-muted-foreground",
        };
        const lapLabel =
          tyre.startLap || tyre.endLap
            ? `, круги ${tyre.startLap ?? "?"}-${tyre.endLap ?? "?"}`
            : "";

        return (
          <span
            aria-label={`${meta.label}${lapLabel}`}
            className={`grid size-6 place-items-center rounded-full border text-[0.68rem] font-bold leading-none ${meta.className}`}
            key={`${compound}-${tyre.startLap ?? index}-${tyre.endLap ?? index}`}
            title={`${meta.label}${lapLabel}`}
          >
            {meta.short}
          </span>
        );
      })}
    </span>
  );
}
