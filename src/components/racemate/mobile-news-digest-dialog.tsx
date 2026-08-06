"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";

import type { DailyDigest } from "@/types/racemate";

export function MobileNewsDigestDialog({
  digest,
}: {
  digest: DailyDigest | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
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
      trigger?.focus();
    };
  }, [isOpen]);

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label="Открыть AI-сводку за день"
        className="grid size-11 shrink-0 place-items-center rounded-md border border-primary/45 bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(225_6_0_/_0.28)] transition-[background-color,transform,filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px lg:hidden"
        onClick={() => setIsOpen(true)}
        ref={triggerRef}
        title="AI-сводка за день"
        type="button"
      >
        <Sparkles aria-hidden="true" className="size-5" />
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
          <div
            aria-labelledby="mobile-news-digest-title"
            aria-modal="true"
            className="fixed inset-0 z-[100] grid items-end bg-background/84 backdrop-blur-md lg:hidden"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsOpen(false);
              }
            }}
            role="dialog"
          >
            <section className="flex max-h-[82dvh] w-full flex-col overflow-hidden rounded-t-lg border border-b-0 border-border bg-card shadow-2xl">
              <header className="flex shrink-0 items-center justify-between gap-4 border-b stitch-divider p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <Sparkles aria-hidden="true" className="size-4" />
                  </span>
                  <h2
                    className="font-display text-lg font-bold text-foreground"
                    id="mobile-news-digest-title"
                  >
                    AI-сводка за день
                  </h2>
                </div>
                <button
                  aria-label="Закрыть AI-сводку"
                  className="grid size-11 shrink-0 place-items-center rounded-md border border-border bg-background/65 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setIsOpen(false)}
                  ref={closeButtonRef}
                  type="button"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              </header>

              <div className="min-h-0 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {digest ? (
                  <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                    {digest.body}
                  </p>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Сводка за прошедшие сутки появится после 12:00 UTC.
                  </p>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
