"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";

type FantasyLockCountdownProps = {
  locked: boolean;
  lockedLabel: string;
  prefix: string;
  startsAtIso?: string | null;
};

export function FantasyLockCountdown({
  locked,
  lockedLabel,
  prefix,
  startsAtIso,
}: FantasyLockCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (locked || !startsAtIso) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(timer);
  }, [locked, startsAtIso]);

  if (locked) {
    return <Badge variant="warning">{lockedLabel}</Badge>;
  }

  return (
    <Badge variant="secondary">
      {formatCountdown(prefix, startsAtIso, now)}
    </Badge>
  );
}

function formatCountdown(prefix: string, startsAtIso: string | null | undefined, now: number) {
  if (!startsAtIso) {
    return `${prefix} · время уточняется`;
  }

  const startsAt = Date.parse(startsAtIso);

  if (!Number.isFinite(startsAt)) {
    return `${prefix} · время уточняется`;
  }

  const diffMinutes = Math.max(0, Math.ceil((startsAt - now) / 60_000));

  if (diffMinutes <= 0) {
    return `${prefix} · скоро`;
  }

  const days = Math.floor(diffMinutes / (60 * 24));
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
  const minutes = diffMinutes % 60;

  if (days > 0) {
    return `${prefix} · ${days} дн. ${hours} ч`;
  }

  if (hours > 0) {
    return `${prefix} · ${hours} ч ${minutes} мин`;
  }

  return `${prefix} · ${Math.max(1, minutes)} мин`;
}
