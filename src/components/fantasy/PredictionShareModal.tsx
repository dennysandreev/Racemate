"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  raceName: string;
  shareImageUrl: string;
  shareSlug: string;
  shareUrl: string;
  scope: PredictionShareScope;
};

const subscribeToMountState = () => () => {};
const getClientMountState = () => true;
const getServerMountState = () => false;

export function PredictionShareModalLauncher({
  raceName,
  shareImageUrl,
  shareSlug,
  shareUrl,
  scope,
}: Omit<PredictionShareModalProps, "onOpenChange" | "open">) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(shareSlug));
  const mounted = useSyncExternalStore(
    subscribeToMountState,
    getClientMountState,
    getServerMountState,
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      router.replace("/fantasy?tab=picks", { scroll: false });
    }
  }, [router]);

  return (
    <PredictionShareModal
      onOpenChange={handleOpenChange}
      open={mounted && open}
      raceName={raceName}
      scope={scope}
      shareImageUrl={shareImageUrl}
      shareSlug={shareSlug}
      shareUrl={shareUrl}
    />
  );
}

export function PredictionShareModal({
  onOpenChange,
  open,
  raceName,
  scope,
  shareImageUrl,
  shareSlug,
  shareUrl,
}: PredictionShareModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const imageFailed = failedImageUrl === shareImageUrl;
  const fileName = buildPredictionShareFileName(scope, shareSlug);
  const shareTitle = scope === "qualification"
    ? "Прогноз на квалификацию RaceMate"
    : "Прогноз на гонку RaceMate";
  const shareText = buildPredictionShareText(raceName, scope);
  const shareTextWithUrl = `${shareText}\n${shareUrl}`;

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

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(shareTextWithUrl);
      setStatus("Текст и ссылка скопированы");
      window.setTimeout(() => setStatus(null), 1800);
    } catch {
      window.prompt("Скопируй текст и ссылку", shareTextWithUrl);
    }
  }

  async function sharePrediction() {
    if (!navigator.share) {
      await copyShareText();
      return;
    }

    try {
      await navigator.share({
        text: shareTextWithUrl,
        title: shareTitle,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      await copyShareText();
    }
  }

  async function downloadImage() {
    try {
      const response = await fetch(shareImageUrl);

      if (!response.ok) {
        throw new Error("Share image is unavailable");
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = fileName;
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
        <header className="flex shrink-0 items-center justify-between gap-3 border-b stitch-divider px-4 py-1.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Trophy aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <h2
              className="min-w-0 truncate font-display text-lg font-extrabold tracking-[-0.02em] sm:text-xl"
              id="prediction-share-title"
            >
              Прогноз сохранён
              <span className="sr-only">
                {scope === "qualification" ? " — квалификация" : " — гонка"}
              </span>
            </h2>
            <span
              aria-hidden="true"
              className="hidden shrink-0 border-l border-border pl-2.5 font-telemetry text-[0.62rem] font-bold uppercase tracking-[0.1em] text-primary sm:inline"
            >
              {scope === "qualification" ? "Квалификация" : "Гонка"}
            </span>
          </div>
          <button
            aria-label="Закрыть окно шеринга"
            className="grid size-11 shrink-0 place-items-center rounded-md border border-border bg-background/65 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenChange(false)}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <div className="overflow-hidden rounded-lg border border-border bg-background/45 lg:max-w-[34rem] lg:justify-self-center">
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
                  alt={scope === "qualification"
                    ? `Превью прогноза RaceMate на поул: ${raceName}`
                    : `Превью прогноза RaceMate на гонку ${raceName}`}
                  className={cn(
                    "block w-full object-cover",
                    "aspect-[1080/1350]",
                  )}
                  height={1350}
                  loading="eager"
                  onError={() => setFailedImageUrl(shareImageUrl)}
                  src={shareImageUrl}
                  unoptimized
                  width={1080}
                />
              )}
            </div>

            <aside className="grid content-start gap-3">
              <Button className="h-12 w-full justify-center" onClick={sharePrediction} type="button">
                <Share2 aria-hidden="true" data-icon="inline-start" />
                Поделиться
              </Button>
              <Button className="h-12 w-full justify-center" onClick={downloadImage} type="button" variant="secondary">
                <Download aria-hidden="true" data-icon="inline-start" />
                Скачать PNG
              </Button>
              {status ? (
                <p className="rounded-sm border border-success/35 bg-success/10 px-3 py-2 text-sm text-success" role="status">
                  {status}
                </p>
              ) : null}
            </aside>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function buildPredictionShareFileName(scope: PredictionShareScope, shareSlug: string) {
  const predictionType = scope === "qualification" ? "qualification" : "race";

  return `racemate-${predictionType}-${shareSlug}.png`;
}

function buildPredictionShareText(
  raceName: string,
  scope: PredictionShareScope,
) {
  return scope === "qualification"
    ? `Я сделал прогноз на поул в ${raceName}. Теперь твоя очередь.`
    : `Я сделал прогноз на ${raceName}. Теперь твоя очередь.`;
}
