import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "text-balance font-display text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:text-3xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}
