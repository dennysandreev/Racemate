import { ChevronDown, ListFilter } from "lucide-react";
import type { ReactNode } from "react";

import { StitchPanel } from "@/components/racemate/stitch-primitives";

export function FeedFiltersDisclosure({ children }: { children: ReactNode }) {
  return (
    <StitchPanel className="overflow-hidden">
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <ListFilter aria-hidden="true" className="size-4" />
            </span>
            <span className="font-display text-sm font-bold text-foreground">
              Фильтры ленты
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        {children}
      </details>
    </StitchPanel>
  );
}
