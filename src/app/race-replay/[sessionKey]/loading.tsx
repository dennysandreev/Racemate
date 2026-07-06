import { NavigationLoadingPlate } from "@/components/racemate/navigation-loading-plate";

export default function RaceReplayLoading() {
  return (
    <main className="grid min-h-[calc(100dvh-5rem)] place-items-center px-4 py-10">
      <NavigationLoadingPlate label="Готовим повтор Гран-при 2025" />
    </main>
  );
}
