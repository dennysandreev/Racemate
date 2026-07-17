import { Cog } from "lucide-react";

import { cn } from "@/lib/utils";

type ProfileLoadingOverlayProps = {
  className?: string;
  label?: string;
};

export function ProfileLoadingOverlay({
  className,
  label = "Загружаем профиль",
}: ProfileLoadingOverlayProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[90] grid place-items-center bg-background/45 p-4 backdrop-blur-[2px]",
        className,
      )}
      role="status"
    >
      <div className="grid justify-items-center gap-3 text-center">
        <span className="grid size-16 place-items-center rounded-full border border-border/70 bg-background/70 text-primary shadow-sm backdrop-blur-md">
          <Cog
            aria-hidden="true"
            className="size-8 animate-spin motion-reduce:animate-none"
            style={{ animationDuration: "1.6s" }}
          />
        </span>
        <span className="rounded-md bg-background/72 px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm backdrop-blur-md">
          {label}
        </span>
      </div>
    </div>
  );
}
