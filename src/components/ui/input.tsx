import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-11 w-full min-w-0 rounded-md border border-input bg-background/55 px-3 py-2 text-base text-foreground outline-none transition-[border-color,box-shadow,opacity] duration-200 placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 sm:text-sm",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60",
        "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30",
        "motion-reduce:transition-none",
        className,
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };
