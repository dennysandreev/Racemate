import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "font-telemetry inline-flex items-center rounded-sm border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] leading-none transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-border bg-secondary/70 text-secondary-foreground",
        outline:
          "border-border text-muted-foreground",
        success:
          "border-success/35 bg-success/10 text-success shadow-[0_0_16px_rgb(57_255_20_/_0.12)]",
        warning:
          "border-warning/35 bg-warning/10 text-warning",
        danger:
          "border-danger/35 bg-danger/10 text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
