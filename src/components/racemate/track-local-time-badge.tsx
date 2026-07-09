"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";

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
    <Badge className="shrink-0" variant="secondary">
      <span suppressHydrationWarning>Время на трассе {formatter.format(now)}</span>
    </Badge>
  );
}
