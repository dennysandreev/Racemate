import Image from "next/image";

import { getCircuitAsset } from "@/data/f1-assets";
import { cn } from "@/lib/utils";
import type { TrackLayout } from "@/types/racemate";

type TrackMapProps = {
  circuit: string;
  compact?: boolean;
  label?: string;
  layout?: TrackLayout | null;
};

export function TrackMap({ circuit, compact }: TrackMapProps) {
  const asset = getCircuitAsset(circuit);

  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-[oklch(0.14_0.014_250)] p-3">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,oklch(0.62_0.22_27_/_0.16),transparent_15rem)]" />
      {asset ? (
        <div
          className={cn(
            "relative grid place-items-center rounded border border-white/10 bg-[oklch(0.08_0.012_250)] p-2",
            compact ? "h-32 sm:h-36" : "h-48",
          )}
        >
          <Image
            alt={`Официальная схема трассы ${circuit}`}
            className="object-contain"
            fill
            priority={Boolean(compact)}
            sizes="(min-width: 1024px) 56rem, 100vw"
            src={asset.src}
          />
        </div>
      ) : (
        <div
          className={cn(
            "relative grid place-items-center rounded border border-border/70 bg-background/50 text-center",
            compact ? "h-32 sm:h-36" : "h-48",
          )}
        >
          <div>
            <p className="text-sm font-medium">Схема трассы пока недоступна</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
              Покажем официальный макет F1, когда он появится в открытых ассетах.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
