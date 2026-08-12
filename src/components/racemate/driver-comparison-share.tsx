"use client";

import Image from "next/image";
import { Copy, Download, ImageIcon, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createDriverComparisonShareCode } from "@/lib/driver-comparison";

export function DriverComparisonShare({
  leftCode,
  leftName,
  leftSlug,
  raceName,
  rightCode,
  rightName,
  rightSlug,
  round,
  season,
}: {
  leftCode?: string;
  leftName: string;
  leftSlug: string;
  raceName: string;
  rightCode?: string;
  rightName: string;
  rightSlug: string;
  round: number;
  season: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const statusTimer = useRef<number | null>(null);
  const params = useMemo(() => {
    const value = new URLSearchParams({
      season: String(season),
      a: leftSlug,
      b: rightSlug,
      round: String(round),
    });

    return value.toString();
  }, [leftSlug, rightSlug, round, season]);
  const comparisonPath = `/drivers/compare?${params}`;
  const imagePath = `/api/share-image/drivers/compare?${params}`;
  const shareCode = createDriverComparisonShareCode(
    season,
    round,
    leftCode,
    rightCode,
  );
  const sharePath = shareCode ? `/c/${shareCode}` : comparisonPath;
  const fileName = `raceside-${leftSlug}-${rightSlug}-round-${round}.png`;
  const title = `${leftName} и ${rightName} - сравнение RaceSide`;
  const text = `${leftName} и ${rightName} после ${raceName}, этап ${round} сезона ${season}.`;

  useEffect(() => () => {
    if (statusTimer.current !== null) {
      window.clearTimeout(statusTimer.current);
    }
  }, []);

  function showStatus(message: string) {
    setStatus(message);

    if (statusTimer.current !== null) {
      window.clearTimeout(statusTimer.current);
    }

    statusTimer.current = window.setTimeout(() => setStatus(null), 2200);
  }

  function getAbsoluteShareUrl() {
    return new URL(sharePath, window.location.origin).toString();
  }

  async function getImageFile() {
    const response = await fetch(imagePath);

    if (!response.ok) {
      throw new Error("Comparison image is unavailable");
    }

    const blob = await response.blob();
    return new File([blob], fileName, { type: "image/png" });
  }

  async function copyLink() {
    const shareUrl = getAbsoluteShareUrl();

    try {
      await navigator.clipboard.writeText(shareUrl);
      showStatus("Ссылка скопирована");
    } catch {
      window.prompt("Скопируй ссылку на сравнение", shareUrl);
    }
  }

  async function shareComparison() {
    const shareUrl = getAbsoluteShareUrl();

    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({ text, title, url: shareUrl });
      showStatus("Ссылка отправлена");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      await copyLink();
    }
  }

  async function downloadImage() {
    try {
      const file = await getImageFile();
      const href = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      showStatus("PNG скачивается");
    } catch {
      window.open(imagePath, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (nextOpen) {
          setImageFailed(false);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button className="h-11 px-3" type="button" variant="outline">
          <Share2 aria-hidden="true" />
          <span className="hidden sm:inline">Поделиться</span>
          <span className="sr-only sm:hidden">Поделиться сравнением</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-4xl lg:h-[92dvh] lg:max-h-[46rem] lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle>Поделиться сравнением</DialogTitle>
          <DialogDescription className="sr-only">
            Превью сравнения и действия для отправки.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 p-4 sm:p-5 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-stretch">
          <div className="overflow-hidden rounded-lg border border-border bg-background/45 lg:min-h-0">
            {imageFailed ? (
              <div className="grid aspect-[4/5] place-items-center p-6 text-center lg:h-full lg:aspect-auto">
                <div className="grid max-w-xs justify-items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
                    <ImageIcon aria-hidden="true" className="size-6" />
                  </span>
                  <p className="font-display text-lg font-bold">Превью пока недоступно</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Ссылка уже работает. Попробуй открыть PNG отдельно.
                  </p>
                  <Button asChild size="sm" variant="secondary">
                    <a href={imagePath} rel="noreferrer" target="_blank">Открыть PNG</a>
                  </Button>
                </div>
              </div>
            ) : (
              <Image
                alt={`Сравнение ${leftName} и ${rightName} после ${raceName}`}
                className="block aspect-[4/5] w-full object-cover lg:h-full lg:aspect-auto lg:object-contain"
                height={1350}
                onError={() => setImageFailed(true)}
                src={imagePath}
                unoptimized
                width={1080}
              />
            )}
          </div>

          <div className="grid content-start gap-3">
            <Button className="h-12 w-full" onClick={shareComparison} type="button">
              <Share2 aria-hidden="true" data-icon="inline-start" />
              Поделиться
            </Button>
            <Button className="h-12 w-full" onClick={copyLink} type="button" variant="secondary">
              <Copy aria-hidden="true" data-icon="inline-start" />
              Скопировать ссылку
            </Button>
            <Button className="h-12 w-full" onClick={downloadImage} type="button" variant="secondary">
              <Download aria-hidden="true" data-icon="inline-start" />
              Скачать PNG
            </Button>
            {status ? (
              <p className="rounded-md border border-success/35 bg-success/10 px-3 py-2 text-sm text-success" role="status">
                {status}
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
