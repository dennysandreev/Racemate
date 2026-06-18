import { cn } from "@/lib/utils";

const fallbackColor = "oklch(var(--primary))";

export function TeamColorDot({
  className,
  color,
}: {
  className?: string;
  color?: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color ?? fallbackColor }}
    />
  );
}

export function TeamColorBar({
  className,
  color,
}: {
  className?: string;
  color?: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("h-8 w-1.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color ?? fallbackColor }}
    />
  );
}

export function TeamColorProgress({
  className,
  color,
  value,
}: {
  className?: string;
  color?: string | null;
  value: number;
}) {
  const width = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full"
        style={{
          backgroundColor: color ?? fallbackColor,
          width: `${width}%`,
        }}
      />
    </div>
  );
}
