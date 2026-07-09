"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ClipboardList, X } from "lucide-react";

import { SessionResultsDialog, type SessionWithResults } from "@/components/racemate/session-results-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PreviousPredictionResult, PredictionResultPick } from "@/types/racemate";

export function QualifyingResultsButton({
  qualifyingResults,
}: {
  qualifyingResults: SessionWithResults | null;
}) {
  const [selected, setSelected] = useState<SessionWithResults | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => {
          if (qualifyingResults) {
            setSelected(qualifyingResults);
            return;
          }

          setEmptyOpen(true);
        }}
        size="sm"
        type="button"
        variant="secondary"
      >
        <ClipboardList aria-hidden="true" className="size-4" />
        Результаты квалификации
      </Button>
      {qualifyingResults ? (
        <SessionResultsDialog onClose={() => setSelected(null)} selected={selected} />
      ) : (
        <PredictionInfoDialog
          onClose={() => setEmptyOpen(false)}
          open={emptyOpen}
          title="Результаты квалификации"
        >
          <p className="text-sm leading-6 text-muted-foreground">
            Результаты квалификации появятся после синхронизации.
          </p>
        </PredictionInfoDialog>
      )}
    </>
  );
}

export function PreviousPredictionResultButton({
  className,
  previousResult,
  triggerLabel = "Прошлый прогноз",
}: {
  className?: string;
  previousResult: PreviousPredictionResult | null;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        className={className}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="secondary"
      >
        <CheckCircle2 aria-hidden="true" className="size-4" />
        {triggerLabel}
      </Button>
      <PredictionInfoDialog
        onClose={() => setOpen(false)}
        open={open}
        title="Прошлый прогноз"
      >
        {previousResult ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="stitch-label text-primary">
                  Раунд {previousResult.round || "—"}
                </p>
                <h3 className="mt-2 font-display text-2xl font-bold">
                  {previousResult.raceName}
                </h3>
              </div>
              <Badge variant="success">{previousResult.score} очков</Badge>
            </div>

            <div className="grid gap-2">
              <p className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Топ-10 гонки
              </p>
              {previousResult.top10.length ? (
                <div className="grid gap-2">
                  {previousResult.top10.map((pick) => (
                    <div
                      className={cn(
                        "grid gap-2 rounded-md border px-3 py-2 text-sm sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:items-center",
                        getTop10ResultTone(pick.points),
                      )}
                      key={`${pick.predictedPosition}-${pick.driverId}`}
                    >
                      <span className="font-telemetry font-bold">P{pick.predictedPosition}</span>
                      <span className="min-w-0 font-semibold">{pick.driverName}</span>
                      <span className="font-telemetry text-xs font-bold">
                        {formatActualPosition(pick.actualPosition)} · {pick.points} очк.
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  В этом прогнозе ещё не было top-10.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <p className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Дополнительные прогнозы
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {previousResult.specials.map((pick) => (
                  <SpecialPickRow key={pick.label} pick={pick} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Прошлый прогноз появится после подсчёта очков.
          </p>
        )}
      </PredictionInfoDialog>
    </>
  );
}

function PredictionInfoDialog({
  children,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[100] isolate grid place-items-center bg-background/94 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="relative z-10 flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/70 p-4 sm:p-5">
          <h2 className="font-display text-xl font-bold" id={titleId}>{title}</h2>
          <Button aria-label="Закрыть" onClick={onClose} size="sm" type="button" variant="secondary">
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function SpecialPickRow({ pick }: { pick: PredictionResultPick }) {
  const hit = pick.points > 0;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        hit
          ? "border-success/55 bg-success/10 text-foreground"
          : "border-destructive/45 bg-destructive/10 text-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{pick.label}</span>
        <span className="font-telemetry text-xs font-bold">{pick.points} очк.</span>
      </div>
      <p className="mt-1 text-muted-foreground">{pick.value}</p>
    </div>
  );
}

function getTop10ResultTone(points: number) {
  if (points >= 5) {
    return "border-success/55 bg-success/10 text-foreground";
  }

  if (points === 3) {
    return "border-warning/65 bg-warning/15 text-foreground";
  }

  if (points === 1) {
    return "border-orange-500/60 bg-orange-500/15 text-foreground";
  }

  return "border-destructive/45 bg-destructive/10 text-foreground";
}

function formatActualPosition(position: number | null) {
  return position ? `финиш P${position}` : "мимо top-10";
}
