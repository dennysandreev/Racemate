import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="telemetry-skeleton-grid" aria-label="Загружаем телеметрию">
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
    </div>
  );
}
