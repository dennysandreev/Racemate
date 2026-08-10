import { Skeleton } from "@/components/ui/skeleton";

export default function DriversLoading() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[1440px] gap-5 px-4 pb-12 pt-20 sm:px-6 lg:px-8 xl:pl-[18rem] xl:pt-6">
      <Skeleton className="h-52 w-full sm:h-40" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-[23rem] w-full" key={index} />
        ))}
      </div>
    </main>
  );
}
