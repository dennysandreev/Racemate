import Image from "next/image";

import {
  getFantasyTrackVariant,
  type FantasyTrackAssetVariant,
  type FantasyTrackVisual,
} from "@/data/fantasy-track-assets";
import { cn } from "@/lib/utils";

export function FantasyTrackVisualImage({
  className,
  preload = false,
  showCredit = true,
  sizes,
  variant = "hero",
  visual,
}: {
  className?: string;
  preload?: boolean;
  showCredit?: boolean;
  sizes: string;
  variant?: FantasyTrackAssetVariant;
  visual: FantasyTrackVisual;
}) {
  const asset = getFantasyTrackVariant(visual, variant);

  return (
    <div
      className={cn(
        "relative aspect-[4/3] min-w-0 w-full overflow-hidden bg-muted",
        className,
      )}
    >
      <Image
        alt={visual.alt}
        className="object-cover"
        fill
        preload={preload}
        sizes={sizes}
        src={asset.src}
        unoptimized
      />
      {showCredit && variant !== "thumb" ? (
        <a
          aria-label={`Источник фотографии: ${visual.credit}`}
          className="absolute bottom-2 right-2 z-10 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold !text-white/90 backdrop-blur-sm transition-colors hover:bg-black/85 hover:!text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          href={visual.sourcePageUrl}
          rel="noreferrer"
          target="_blank"
          title={`Фото: ${visual.credit}`}
        >
          Фото: {visual.credit}
        </a>
      ) : null}
    </div>
  );
}
