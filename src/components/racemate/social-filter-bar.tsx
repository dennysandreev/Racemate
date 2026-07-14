import { Filter, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  SocialFilterOptions,
  SocialMode,
  SocialPlatform,
} from "@/types/racemate";

type SocialFilterBarProps = {
  active: { topic: string; team: string; driver: string; race: string };
  mode: SocialMode;
  options: SocialFilterOptions;
  platform: SocialPlatform;
  platforms: { label: string; value: SocialPlatform }[];
};

export function SocialFilterBar({ active, mode, options, platform, platforms }: SocialFilterBarProps) {
  const hasFilters = platform !== "all" || Object.values(active).some(Boolean);
  const form = (
    <FilterForm active={active} hasFilters={hasFilters} mode={mode} options={options} platform={platform} platforms={platforms} />
  );

  return (
    <>
      <div className="stitch-panel hidden overflow-hidden lg:block">{form}</div>
      <details className="group stitch-panel overflow-hidden lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4">
          <span className="inline-flex items-center gap-2 text-sm font-semibold"><Filter aria-hidden="true" className="size-4" />Фильтры</span>
          <span className="text-xs text-muted-foreground group-open:hidden">Открыть</span>
          <span className="hidden text-xs text-muted-foreground group-open:inline">Свернуть</span>
        </summary>
        {form}
      </details>
    </>
  );
}

function FilterForm({ active, hasFilters, mode, options, platform, platforms }: SocialFilterBarProps & { hasFilters: boolean }) {
  return (
    <form className="grid gap-3 border-t stitch-divider p-3 lg:grid-cols-[0.7fr_repeat(4,minmax(0,1fr))_auto] lg:border-t-0" method="get">
      {mode !== "main" ? <input name="mode" type="hidden" value={mode} /> : null}
      <FilterSelect label="Платформа" name="platform" options={platforms.filter((item) => item.value !== "all").map((item) => ({ label: item.label, value: item.value }))} value={platform === "all" ? "" : platform} />
      <FilterSelect label="Категория" name="topic" options={options.topics} value={active.topic} />
      <FilterSelect label="Команда" name="team" options={options.teams} value={active.team} />
      <FilterSelect label="Пилот" name="driver" options={options.drivers} value={active.driver} />
      <FilterSelect label="Этап" name="race" options={options.races} value={active.race} />
      <div className="flex items-end gap-2">
        <Button className="flex-1 lg:flex-none" size="sm" type="submit" variant="secondary">Показать</Button>
        {hasFilters ? (
          <Button aria-label="Сбросить фильтры" asChild className="size-9 px-0" size="sm" variant="ghost">
            <a href={mode === "main" ? "/social" : `/social?mode=${mode}`} title="Сбросить фильтры"><RotateCcw aria-hidden="true" className="size-4" /></a>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function FilterSelect({ label, name, options, value }: { label: string; name: string; options: { label: string; value: string }[]; value: string }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-[0.68rem] font-semibold uppercase text-muted-foreground">
      {label}
      <select
        className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm font-normal normal-case text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        defaultValue={value}
        name={name}
      >
        <option value="">Все</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
