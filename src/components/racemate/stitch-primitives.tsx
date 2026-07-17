import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export function StitchPageHeader({
  actions,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  eyebrow?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b stitch-divider pb-5">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">{eyebrow}</div>
        ) : null}
        <h1 className="font-display text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-4xl">
          {title}
        </h1>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StitchPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("stitch-panel", className)}>{children}</section>;
}

export function StitchPanelHeader({
  action,
  icon: Icon,
  meta,
  title,
}: {
  action?: ReactNode;
  icon?: IconComponent;
  meta?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b stitch-divider p-4">
      <div className="min-w-0">
        <h2 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold leading-tight">
          {Icon ? <Icon aria-hidden="true" className="size-5 shrink-0" /> : null}
          <span className="truncate">{title}</span>
        </h2>
        {meta ? <div className="mt-2 text-sm text-muted-foreground">{meta}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function StitchMetric({
  display = false,
  label,
  tone = "neutral",
  value,
}: {
  display?: boolean;
  label: string;
  tone?: "neutral" | "live" | "red" | "warning";
  value: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background/35 p-3",
        display && "grid min-h-28 content-center justify-items-center px-4 text-center sm:min-h-32",
        tone === "live" && "border-success/50 bg-success/10",
        tone === "red" && "border-primary/55 bg-primary/10",
        tone === "warning" && "border-warning/50 bg-warning/10",
      )}
    >
      <p className="stitch-label text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-telemetry mt-2 text-lg font-bold",
          display && "mt-3 text-3xl sm:text-4xl",
          tone === "live" && "text-success",
          tone === "red" && "text-primary",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function StitchProgressBar({
  color,
  label,
  value,
}: {
  color?: string | null;
  label: string;
  value: number;
}) {
  const width = Math.max(0, Math.min(100, value));

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="font-telemetry text-muted-foreground">{width}%</span>
      </div>
      <div className="h-1.5 overflow-hidden bg-muted">
        <div
          className="h-full bg-primary"
          style={{ backgroundColor: color ?? undefined, width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function StitchSegmentedLinks({
  className,
  items,
  linkClassName,
}: {
  className?: string;
  items: Array<{ active?: boolean; href: string; label: string }>;
  linkClassName?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-border bg-background/45 p-1", className)}>
      {items.map((item) => (
        <Link
          className={cn(
            "rounded-sm px-3 py-2 text-sm font-semibold transition-colors",
            item.active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
            linkClassName,
          )}
          href={item.href}
          key={item.href + item.label}
          prefetch={false}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function StitchStatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "live" | "red" | "warning";
}) {
  const variant = tone === "live" ? "success" : tone === "warning" ? "warning" : tone === "red" ? "danger" : "secondary";

  return <Badge variant={variant}>{children}</Badge>;
}
