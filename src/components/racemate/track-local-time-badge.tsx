"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";

export function TrackLocalTimeBadge({ timezone }: { timezone?: string | null }) {
  const [now, setNow] = useState(() => new Date());
  const formatters = useMemo(() => {
    if (!timezone) {
      return null;
    }

    try {
      return {
        offset: new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          timeZoneName: "shortOffset",
        }),
        time: new Intl.DateTimeFormat("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: timezone,
        }),
      };
    } catch {
      return null;
    }
  }, [timezone]);

  useEffect(() => {
    if (!formatters) {
      return;
    }

    const interval = window.setInterval(() => setNow(new Date()), 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [formatters]);

  if (!formatters) {
    return null;
  }

  const offsetPart = formatters.offset
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")
    ?.value;
  const offset = offsetPart === "GMT" ? "GMT+0" : offsetPart;

  return (
    <div className="grid min-h-12 grid-cols-[auto_1fr] gap-3 py-2" title={timezone ?? undefined}>
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-warning/12 text-warning">
        <Clock3 aria-hidden="true" className="size-3.5" />
      </span>
      <span className="grid min-w-0 content-center gap-1">
        <span className="text-xs font-semibold text-muted-foreground">
          Время на трассе
        </span>
        <time
          className="min-w-0 font-mono text-sm font-bold leading-5 text-foreground"
          dateTime={now.toISOString()}
          suppressHydrationWarning
        >
          {formatters.time.format(now)}{offset ? ` (${offset})` : ""}
        </time>
      </span>
    </div>
  );
}
