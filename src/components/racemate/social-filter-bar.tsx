"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, RotateCcw } from "lucide-react";

import { FeedFiltersDisclosure } from "@/components/racemate/feed-filters-disclosure";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasFilters = platform !== "all" || Object.values(active).some(Boolean);
  const updateFilter = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }

    const query = params.toString();
    router.push(query ? `/social?${query}` : "/social", { scroll: false });
  };
  const form = (
    <FilterForm
      active={active}
      hasFilters={hasFilters}
      mode={mode}
      onFilterChange={updateFilter}
      options={options}
      platform={platform}
      platforms={platforms}
    />
  );

  return (
    <>
      <div className="stitch-panel hidden overflow-hidden lg:block">{form}</div>
      <div className="lg:hidden">
        <FeedFiltersDisclosure>{form}</FeedFiltersDisclosure>
      </div>
    </>
  );
}

function FilterForm({ active, hasFilters, mode, onFilterChange, options, platform, platforms }: SocialFilterBarProps & { hasFilters: boolean; onFilterChange: (name: string, value: string) => void }) {
  return (
    <div className="grid gap-2 border-t border-border/70 p-3 lg:grid-cols-[0.7fr_repeat(4,minmax(0,1fr))_auto] lg:border-t-0">
      <FilterSelect label="Платформа" name="platform" onChange={onFilterChange} options={platforms.filter((item) => item.value !== "all").map((item) => ({ label: item.label, value: item.value }))} value={platform === "all" ? "" : platform} />
      <FilterSelect label="Категория" name="topic" onChange={onFilterChange} options={options.topics} value={active.topic} />
      <FilterSelect label="Команда" name="team" onChange={onFilterChange} options={options.teams} value={active.team} />
      <FilterSelect label="Пилот" name="driver" onChange={onFilterChange} options={options.drivers} value={active.driver} />
      <FilterSelect label="Этап" name="race" onChange={onFilterChange} options={options.races} value={active.race} />
      <div className="flex items-center justify-end gap-2">
        {hasFilters ? (
          <Button aria-label="Сбросить фильтры" asChild className="size-11 px-0" size="sm" variant="ghost">
            <Link href={mode === "main" ? "/social" : `/social?mode=${mode}`} scroll={false} title="Сбросить фильтры"><RotateCcw aria-hidden="true" className="size-4" /></Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({ label, name, onChange, options, value }: { label: string; name: string; onChange: (name: string, value: string) => void; options: { label: string; value: string }[]; value: string }) {
  return (
    <label className="group flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card/60 px-3 transition-colors focus-within:border-primary/60 focus-within:bg-accent/45">
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        className="feed-filter-select min-w-0 flex-1 appearance-none bg-transparent pr-5 text-right text-sm font-medium text-foreground outline-none"
        name={name}
        onChange={(event) => onChange(name, event.target.value)}
        value={value}
      >
        <option value="">Все</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none -ml-4 size-4 shrink-0 text-muted-foreground" />
    </label>
  );
}
