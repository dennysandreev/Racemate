"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Download, ImageIcon, Share2, Trophy, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PredictionShareScope } from "@/types/racemate";

type PredictionShareModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publicUrl: string;
  raceName: string;
  shareImageUrl: string;
  shareSlug: string;
  scope: PredictionShareScope;
};

export function PredictionShareModalLauncher({
  publicUrl,
  raceName,
  shareImageUrl,
  shareSlug,
  scope,
}: Omit<PredictionShareModalProps, "onOpenChange" | "open">) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(shareSlug));

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      router.replace("/fantasy?tab=picks", { scroll: false });
    }
  }, [router]);

  return (
    <PredictionShareModal
      onOpenChange={handleOpenChange}
      open={open}
      publicUrl={publicUrl}
      raceName={raceName}
      scope={scope}
      shareImageUrl={shareImageUrl}
      shareSlug={shareSlug}
    />
  );
}

export function PredictionShareModal({
  onOpenChange,
  open,
  publicUrl,
  raceName,
  scope,
  shareImageUrl,
  shareSlug,
}: PredictionShareModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const imageFailed = failedImageUrl === shareImageUrl;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setStatus("Ссылка скопирована");
      window.setTimeout(() => setStatus(null), 1800);
    } catch {
      window.prompt("Скопируй ссылку", publicUrl);
    }
  }

  async function sharePrediction() {
    const shareText = buildPredictionShareText(raceName, publicUrl);

    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      const response = await fetch(shareImageUrl);
      const blob = await response.blob();
      const file = new File([blob], `racemate-prediction-${shareSlug}.png`, {
        type: blob.type || "image/png",
      });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: shareText,
          title: "Прогноз RaceMate",
          url: publicUrl,
        });
        return;
      }
    } catch {
      // Link sharing below is a reliable fallback when file sharing is unavailable.
    }

    try {
      await navigator.share({
        text: shareText,
        title: "Прогноз RaceMate",
        url: publicUrl,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      await copyLink();
    }
  }

  async function downloadImage() {
    try {
      const response = await fetch(shareImageUrl);
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `racemate-prediction-${shareSlug}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      setStatus("PNG скачивается");
      window.setTimeout(() => setStatus(null), 1600);
    } catch {
      window.open(shareImageUrl, "_blank", "noopener,noreferrer");
    }
  }

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-labelledby="prediction-share-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/76 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      role="dialog"
    >
      <section className="stitch-panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b stitch-divider p-5 sm:p-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <Trophy aria-hidden="true" className="size-5" />
              <span className="font-telemetry text-xs font-bold uppercase tracking-[0.1em]">
                {scope === "qualification" ? "Квалификация" : "Гонка"}
              </span>
            </div>
            <h2
              className="mt-3 font-display text-balance text-2xl font-extrabold tracking-[-0.03em] sm:text-4xl"
              id="prediction-share-title"
            >
              Прогноз сохранён
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {raceName}
            </p>
          </div>
          <button
            aria-label="Закрыть окно шеринга"
            className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-background/65 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenChange(false)}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <div className="overflow-hidden rounded-lg border border-border bg-background/45">
              {imageFailed ? (
                <div className={cn(
                  "grid place-items-center p-6 text-center",
                  "aspect-[1080/1350]",
                )}>
                  <div className="grid max-w-sm justify-items-center gap-3">
                    <span className="grid size-14 place-items-center rounded-md bg-primary/10 text-primary">
                      <ImageIcon aria-hidden="true" className="size-7" />
                    </span>
                    <div>
                      <p className="font-display text-xl font-bold">Карточка готовится</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Ссылка уже работает. Открой PNG отдельно или скачай его после обновления превью.
                      </p>
                    </div>
                    <Button asChild size="sm" variant="secondary">
                      <a href={shareImageUrl} rel="noreferrer" target="_blank">
                        Открыть PNG
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <Image
                  alt={`Превью прогноза RaceMate на ${raceName}`}
                  className={cn(
                    "block w-full object-cover",
                    "aspect-[1080/1350]",
                  )}
                  height={1350}
                  onError={() => setFailedImageUrl(shareImageUrl)}
                  src={shareImageUrl}
                  unoptimized
                  width={1080}
                />
              )}
            </div>

            <aside className="grid content-start gap-3">
              <div className="rounded-md border border-border bg-background/35 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <ImageIcon aria-hidden="true" className="size-5" />
                  <p className="font-display text-lg font-bold">Карточка готова</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Отправь карточку вместе со ссылкой на прогноз или сохрани PNG для поста.
                </p>
                {status ? (
                  <p className="mt-3 rounded-sm border border-success/35 bg-success/10 px-3 py-2 text-sm text-success">
                    {status}
                  </p>
                ) : null}
              </div>

              <Button className="h-12 w-full justify-center" onClick={sharePrediction} type="button">
                <Share2 aria-hidden="true" data-icon="inline-start" />
                Поделиться
              </Button>
              <Button className="h-12 w-full justify-center" onClick={downloadImage} type="button" variant="secondary">
                <Download aria-hidden="true" data-icon="inline-start" />
                Скачать PNG
              </Button>
            </aside>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function buildPredictionShareText(raceName: string, publicUrl: string) {
  return `Мой прогноз на ${raceName} в RaceMate. Сделай свой прогноз: ${publicUrl}`;
}
