"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Shield, Users } from "lucide-react";

type NewsFilter = { name: string; slug: string };

export function NewsQuickFilters({
  activeTag,
  drivers,
  teams,
}: {
  activeTag?: string;
  drivers: NewsFilter[];
  teams: NewsFilter[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function applyTag(tag: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (tag) {
      params.set("tag", tag);
      params.delete("filter");
      params.delete("race");
    } else {
      params.delete("tag");
    }
    params.delete("page");
    const query = params.toString();
    router.push(query ? `/news?${query}` : "/news");
  }

  return (
    <div className="grid w-full gap-2 rounded-lg border border-border/75 bg-background/45 p-2 sm:grid-cols-2 lg:w-auto lg:min-w-[28rem]">
      <label className="group flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card/60 px-3 transition-colors focus-within:border-primary/60 focus-within:bg-accent/45">
        <Shield aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">Команда</span>
        <select
          aria-label="Фильтр новостей по команде"
          className="min-w-0 flex-1 appearance-none bg-transparent pr-5 text-right text-sm font-medium outline-none"
          id="news-team-filter"
          onChange={(event) => applyTag(event.target.value)}
          value={teams.some((item) => item.slug === activeTag) ? activeTag : ""}
        >
          <option value="">Все команды</option>
          {teams.map((team) => (
            <option key={team.slug} value={team.slug}>
              {team.name}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none -ml-4 size-4 shrink-0 text-muted-foreground" />
      </label>

      <label className="group flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card/60 px-3 transition-colors focus-within:border-primary/60 focus-within:bg-accent/45">
        <Users aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">Пилот</span>
        <select
          aria-label="Фильтр новостей по пилоту"
          className="min-w-0 flex-1 appearance-none bg-transparent pr-5 text-right text-sm font-medium outline-none"
          id="news-driver-filter"
          onChange={(event) => applyTag(event.target.value)}
          value={drivers.some((item) => item.slug === activeTag) ? activeTag : ""}
        >
          <option value="">Все пилоты</option>
          {drivers.map((driver) => (
            <option key={driver.slug} value={driver.slug}>
              {driver.name}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none -ml-4 size-4 shrink-0 text-muted-foreground" />
      </label>
    </div>
  );
}
