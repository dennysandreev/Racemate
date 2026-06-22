"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp, Flag, Medal, Target, Trophy, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const topTenRules = [
  { label: "Точная позиция", points: "5" },
  { label: "Ошибка на одну позицию", points: "3" },
  { label: "Пилот в топ-10, но дальше одной позиции", points: "1" },
  { label: "Пилот вне топ-10", points: "0" },
];

const bonusRules = [
  { label: "Весь подиум в любом порядке", points: "+5" },
  { label: "Все десять пилотов в топ-10 в любом порядке", points: "+15" },
  { label: "Идеальный топ-10", points: "+50" },
];

const specialRules = [
  { label: "Поул-позиция", points: "+10" },
  { label: "Лучший круг в гонке", points: "+8" },
  { label: "Первый сход", points: "+12" },
  { label: "Лучшая команда этапа", points: "+10" },
  { label: "Быстрейший пит-стоп", points: "+10" },
];

export function FantasyScoringDialog({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <Button className={cn("justify-center", className)} onClick={() => setIsOpen(true)} type="button" variant="outline">
        <CircleHelp aria-hidden="true" data-icon="inline-start" />
        Как считаются очки
      </Button>

      {isOpen ? (
        <div
          aria-labelledby="fantasy-scoring-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/72 p-3 backdrop-blur-md sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
          role="dialog"
        >
          <section className="stitch-panel flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b stitch-divider p-5 sm:p-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-primary">
                  <Trophy aria-hidden="true" className="size-5" />
                  <span className="font-telemetry text-xs font-bold uppercase tracking-[0.1em]">
                    Фентази лига
                  </span>
                </div>
                <h2
                  className="mt-3 font-display text-balance text-2xl font-extrabold tracking-[-0.03em] sm:text-4xl"
                  id="fantasy-scoring-title"
                >
                  Как считаются очки
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Результаты считаются по официальной итоговой классификации после всех
                  штрафов.
                </p>
              </div>
              <button
                aria-label="Закрыть правила начисления очков"
                className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-background/65 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setIsOpen(false)}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </header>

            <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
              <div className="grid gap-7">
                <section>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Target aria-hidden="true" className="size-5 text-primary" />
                      <h3 className="font-display text-xl font-bold">Топ-10 гонки</h3>
                    </div>
                    <ScoreCap label="До 100 очков" />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Расставь десять пилотов в предполагаемом порядке финиша.
                  </p>
                  <div className="mt-4 overflow-hidden rounded-md border border-border/80">
                    {topTenRules.map((rule) => (
                      <RuleRow key={rule.label} label={rule.label} points={rule.points} />
                    ))}
                  </div>
                </section>

                <section className="border-t stitch-divider pt-6">
                  <div className="flex items-center gap-2">
                    <Medal aria-hidden="true" className="size-5 text-warning" />
                    <h3 className="font-display text-xl font-bold">Бонусы</h3>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-md border border-border/80">
                    {bonusRules.map((rule) => (
                      <RuleRow key={rule.label} label={rule.label} points={rule.points} />
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    За идеальный топ-10 начисляется только бонус +50: бонусы за подиум и
                    все десять пилотов отдельно не добавляются.
                  </p>
                </section>

                <section className="border-t stitch-divider pt-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Flag aria-hidden="true" className="size-5 text-primary" />
                      <h3 className="font-display text-xl font-bold">Дополнительные прогнозы</h3>
                    </div>
                    <ScoreCap label="До 50 очков" />
                  </div>
                  <div className="mt-4 overflow-hidden rounded-md border border-border/80">
                    {specialRules.map((rule) => (
                      <RuleRow key={rule.label} label={rule.label} points={rule.points} />
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Поул считается по результату квалификации, а не по стартовой решетке
                    после штрафов.
                  </p>
                </section>

                <div className="border-y border-primary/35 bg-primary/10 px-4 py-5 sm:px-5">
                  <p className="font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-primary">
                    Максимум за этап
                  </p>
                  <p className="mt-2 font-display text-3xl font-extrabold tracking-[-0.03em]">
                    150 очков
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function RuleRow({ label, points }: { label: string; points: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-b-0">
      <span className="text-sm leading-5 text-foreground">{label}</span>
      <span className="font-telemetry shrink-0 text-sm font-bold text-primary">{points}</span>
    </div>
  );
}

function ScoreCap({ label }: { label: string }) {
  return (
    <span className="font-telemetry shrink-0 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </span>
  );
}
