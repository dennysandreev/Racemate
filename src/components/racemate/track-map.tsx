import Image from "next/image";

import { getCircuitAsset } from "@/data/f1-assets";
import { cn } from "@/lib/utils";
import type { TrackLayout } from "@/types/racemate";

type TrackMapProps = {
  circuit: string;
  compact?: boolean;
  fill?: boolean;
  label?: string;
  layout?: TrackLayout | null;
  unframed?: boolean;
};

export function TrackMap({ circuit, compact, fill = false, unframed = false }: TrackMapProps) {
  const asset = getCircuitAsset(circuit);

  return (
    <div
      className={cn(
        "relative min-w-0 max-w-full overflow-hidden",
        !unframed && "race-track-surface rounded-md",
        fill ? "h-full w-full" : "p-3",
      )}
    >
      {!fill && !unframed ? (
        <div className="race-track-overlay absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgb(225_6_0_/_0.16),transparent_15rem)]" />
      ) : null}
      {asset ? (
        <div
          className={cn(
            "race-track-image-stage relative grid min-w-0 max-w-full place-items-center overflow-hidden rounded",
            fill || unframed ? "border-0 bg-transparent p-0" : "border border-white/10 bg-black/40 p-2",
            fill ? "h-full min-h-0 w-full" : compact ? "h-32 sm:h-36" : "h-48",
          )}
        >
          <Image
            alt={`Официальная схема трассы ${circuit}`}
            className="object-contain"
            fill
            priority
            sizes={compact ? "(max-width: 640px) 360px, (max-width: 1024px) 720px, 56rem" : "(max-width: 640px) 360px, 48rem"}
            src={asset.src}
          />
        </div>
      ) : (
        <div
          className={cn(
            "race-track-image-stage relative grid min-w-0 max-w-full place-items-center overflow-hidden rounded text-center",
            fill || unframed ? "border-0 bg-transparent" : "border border-border/70 bg-background/50",
            fill ? "h-full min-h-0 w-full" : compact ? "h-32 sm:h-36" : "h-48",
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
