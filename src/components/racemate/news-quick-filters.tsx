"use client";

import { useRouter, useSearchParams } from "next/navigation";

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
    <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
      <label className="sr-only" htmlFor="news-team-filter">
        Команда
      </label>
      <select
        className="min-h-9 max-w-44 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        id="news-team-filter"
        onChange={(event) => applyTag(event.target.value)}
        value={teams.some((item) => item.slug === activeTag) ? activeTag : ""}
      >
        <option value="">Команда</option>
        {teams.map((team) => (
          <option key={team.slug} value={team.slug}>
            {team.name}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="news-driver-filter">
        Пилот
      </label>
      <select
        className="min-h-9 max-w-44 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        id="news-driver-filter"
        onChange={(event) => applyTag(event.target.value)}
        value={drivers.some((item) => item.slug === activeTag) ? activeTag : ""}
      >
        <option value="">Пилот</option>
        {drivers.map((driver) => (
          <option key={driver.slug} value={driver.slug}>
            {driver.name}
          </option>
        ))}
      </select>
    </div>
  );
}
