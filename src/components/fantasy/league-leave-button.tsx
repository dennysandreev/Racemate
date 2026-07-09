"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { leaveFantasyLeague } from "@/app/fantasy/actions";
import { Button } from "@/components/ui/button";

export function LeagueLeaveButton({ leagueId }: { leagueId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="grid gap-2 rounded-lg border border-danger/35 bg-danger/10 p-3 text-right">
        <p className="text-sm font-semibold text-foreground">
          Выйти из лиги?
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Твои личные прогнозы останутся, но лига пропадет из списка.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => setConfirming(false)}
            size="sm"
            type="button"
            variant="secondary"
          >
            Остаться
          </Button>
          <form action={leaveFantasyLeague}>
            <input name="leagueId" type="hidden" value={leagueId} />
            <Button
              className="border border-danger/50 bg-danger text-primary-foreground hover:bg-danger/90"
              size="sm"
              type="submit"
            >
              Выйти
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <Button
      onClick={() => setConfirming(true)}
      size="sm"
      type="button"
      variant="secondary"
    >
      <LogOut aria-hidden="true" className="size-4" />
      Выйти из лиги
    </Button>
  );
}
