import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DataRow({
  label,
  value,
  helper,
  className,
}: {
  label: string;
  value: ReactNode;
  helper?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-h-14 grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-muted px-3",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        {helper ? (
          <span className="block truncate text-xs text-muted-foreground">
            {helper}
          </span>
        ) : null}
      </span>
      <span className="text-right font-mono text-sm">{value}</span>
    </div>
  );
}
