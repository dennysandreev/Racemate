"use client";

import { useState } from "react";

import { SessionResultsDialog, type SessionWithResults } from "@/components/racemate/session-results-dialog";
import { SessionWeatherTile } from "@/components/racemate/session-weather-tile";

type HomeSessionStripProps = {
  activeSessionName: string;
  sessions: SessionWithResults[];
};

export function HomeSessionStrip({ activeSessionName, sessions }: HomeSessionStripProps) {
  const [selected, setSelected] = useState<SessionWithResults | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {sessions.map((item) => (
          <button
            aria-label={`Открыть результаты: ${item.session.name}`}
            className="rounded-md text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            key={item.session.id ?? item.session.name}
            onClick={() => setSelected(item)}
            type="button"
          >
            <SessionWeatherTile
              compact
              isActive={item.session.name === activeSessionName}
              session={item.session}
              showStatusBadge={false}
            />
          </button>
        ))}
      </div>
      <SessionResultsDialog onClose={() => setSelected(null)} selected={selected} />
    </>
  );
}
