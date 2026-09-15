import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <main className="fixed inset-0 grid grid-rows-[52px_1fr] bg-background">
      <header className="flex items-center gap-6 border-b px-5">
        <Link href="/weekend" aria-label="Вернуться на текущий этап">
          ←
        </Link>
        <strong>RaceSide LIVE</strong>
      </header>
      <div className="grid min-h-0 grid-cols-1 gap-6 p-6 lg:grid-cols-[250px_1fr_300px]">
        <div className="hidden gap-3 lg:grid">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton className="h-8 w-full" key={i} />
          ))}
        </div>
        <Skeleton className="size-full" />
        <div className="hidden gap-5 lg:grid">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton className="h-20 w-full" key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}
