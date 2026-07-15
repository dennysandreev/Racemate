"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";

export function TrackLocalTimeBadge({ timezone }: { timezone?: string | null }) {
  const [now, setNow] = useState(() => new Date());
  const formatter = useMemo(() => {
    if (!timezone) {
      return null;
    }

    try {
      return new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
      });
    } catch {
      return null;
    }
  }, [timezone]);

  useEffect(() => {
    if (!formatter) {
      return;
    }

    const interval = window.setInterval(() => setNow(new Date()), 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [formatter]);

  if (!formatter) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-2.5" title={timezone ?? undefined}>
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-warning/12 text-warning">
        <Clock3 aria-hidden="true" className="size-4" />
      </span>
      <span className="grid min-w-0 gap-0.5 text-right">
        <span className="text-[0.625rem] font-semibold leading-none text-muted-foreground">
          Время на трассе
        </span>
        <time
          className="font-telemetry text-base font-extrabold leading-none text-foreground"
          dateTime={now.toISOString()}
          suppressHydrationWarning
        >
          {formatter.format(now)}
        </time>
      </span>
    </div>
  );
}
