"use client";

import Image from "next/image";
import { Box, Map } from "lucide-react";
import { useState } from "react";

import { TrackModel3DLazy } from "@/components/racemate/track-model-3d-lazy";
import { Button } from "@/components/ui/button";
import { getCircuitAsset } from "@/data/f1-assets";
import { getThreeDimensionalTrackModelId } from "@/data/track-models";
import { cn } from "@/lib/utils";
import type { TrackLayout } from "@/types/racemate";

type TrackMapProps = {
  assetSrc?: string | null;
  circuit: string;
  compact?: boolean;
  fill?: boolean;
  label?: string;
  layout?: TrackLayout | null;
  showModel3d?: boolean;
  unframed?: boolean;
};

export function TrackMap({
  assetSrc,
  circuit,
  compact,
  fill = false,
  showModel3d = false,
  unframed = false,
}: TrackMapProps) {
  const legacyAsset = assetSrc === undefined ? getCircuitAsset(circuit) : null;
  const imageSrc = assetSrc ?? legacyAsset?.src ?? null;
  const trackModelId = getThreeDimensionalTrackModelId(circuit);
  const modelViewKey = trackModelId ? `${trackModelId}:${imageSrc ?? "no-image"}` : null;
  const [activeModelView, setActiveModelView] = useState<string | null>(null);
  const canShowModel3d = showModel3d && modelViewKey !== null;
  const useModel3d = canShowModel3d && activeModelView === modelViewKey;

  return (
    <div
      className={cn(
        "relative flex min-w-0 max-w-full flex-col overflow-hidden",
        !unframed && "race-track-surface rounded-md",
        fill ? "h-full w-full" : "gap-2 p-3",
      )}
    >
      {!fill && !unframed ? (
        <div className="race-track-overlay absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgb(225_6_0_/_0.16),transparent_15rem)]" />
      ) : null}
      {canShowModel3d ? (
        <div className={cn("relative flex justify-end", fill && "mb-2")}>
          <Button
            aria-pressed={useModel3d}
            onClick={() => setActiveModelView(useModel3d ? null : modelViewKey)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {useModel3d ? (
              <Map aria-hidden="true" data-icon="inline-start" />
            ) : (
              <Box aria-hidden="true" data-icon="inline-start" />
            )}
            {useModel3d ? "Показать схему" : "3D-визуализация"}
          </Button>
        </div>
      ) : null}
      {useModel3d && trackModelId ? (
        <div
          className={cn(
            "race-track-image-stage relative min-w-0 max-w-full overflow-hidden rounded border border-white/10 bg-black/40",
            fill
              ? "min-h-0 w-full flex-1"
              : compact
                ? "h-52 sm:h-64"
                : "h-[22rem] sm:h-[27rem]",
          )}
        >
          <TrackModel3DLazy
            circuit={circuit}
            compact={compact}
            fill={fill}
            key={trackModelId}
            modelId={trackModelId}
          />
        </div>
      ) : imageSrc ? (
        <div
          className={cn(
            "race-track-image-stage relative grid min-w-0 max-w-full place-items-center overflow-hidden rounded",
            fill || unframed ? "border-0 bg-transparent p-0" : "border border-white/10 bg-black/40 p-2",
            fill ? "min-h-0 w-full flex-1" : compact ? "h-32 sm:h-36" : "h-48",
          )}
        >
          <Image
            alt={`Официальная схема трассы ${circuit}`}
            className="object-contain"
            fill
            priority
            sizes={compact ? "(max-width: 640px) 360px, (max-width: 1024px) 720px, 56rem" : "(max-width: 640px) 360px, 48rem"}
            src={imageSrc}
          />
        </div>
      ) : (
        <div
          className={cn(
            "race-track-image-stage relative grid min-w-0 max-w-full place-items-center overflow-hidden rounded text-center",
            fill || unframed ? "border-0 bg-transparent" : "border border-border/70 bg-background/50",
            fill ? "min-h-0 w-full flex-1" : compact ? "h-32 sm:h-36" : "h-48",
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
