import { AppShell } from "@/components/racemate/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export function PublicPageLoading({
  label,
  variant = "cards",
}: {
  label: string;
  variant?: "cards" | "table" | "feed";
}) {
  return (
    <AppShell>
      <PublicPageSkeleton label={label} variant={variant} />
    </AppShell>
  );
}

export function PublicPageSkeleton({ label, variant = "cards" }: {
  label: string;
  variant?: "cards" | "table" | "feed";
}) {
  return (
      <div className="grid gap-5" role="status" aria-label={label}>
        <span className="sr-only">{label}</span>
        <Skeleton className="h-52 w-full sm:h-40" />
        <div aria-hidden="true" className={variant === "table" ? "grid gap-3" : "grid gap-4 sm:grid-cols-2"}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className={variant === "table" ? "h-14 w-full" : variant === "feed" ? "h-72 w-full" : "h-64 w-full"} key={index} />
          ))}
        </div>
      </div>
  );
}
