"use client";

import Image from "next/image";
import { Download, ImageIcon, LoaderCircle, RefreshCw, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function GrandPrixRecapShare({
  compact = false,
  raceName,
  round,
  season,
}: {
  compact?: boolean;
  raceName: string;
  round: number;
  season: number;
}) {
  const [busyAction, setBusyAction] = useState<"download" | "share" | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const statusTimer = useRef<number | null>(null);
  const imagePath = `/api/share-image/grand-prix/${season}/${round}`;
  const fileName = `raceside-${season}-round-${round}-recap.png`;

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

    statusTimer.current = window.setTimeout(() => setStatus(null), 3200);
  }

  async function getImageFile() {
    const response = await fetch(imagePath);

    if (!response.ok) {
      throw new Error("Grand Prix recap image is unavailable");
    }

    const blob = await response.blob();
    return new File([blob], fileName, { type: "image/png" });
  }

  async function downloadFile(file?: File) {
    const imageFile = file ?? await getImageFile();
    const href = URL.createObjectURL(imageFile);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
  }

  async function shareImage() {
    setBusyAction("share");

    try {
      const file = await getImageFile();
      const shareData = { files: [file] };

      if (!navigator.share || !navigator.canShare?.(shareData)) {
        await downloadFile(file);
        showStatus("Отправка файлов здесь не поддерживается — PNG скачан");
        return;
      }

      await navigator.share(shareData);
      showStatus("Карточка отправлена");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      showStatus("Не удалось отправить карточку. Попробуй ещё раз");
    } finally {
      setBusyAction(null);
    }
  }

  async function downloadImage() {
    setBusyAction("download");

    try {
      await downloadFile();
      showStatus("PNG скачивается");
    } catch {
      showStatus("Не удалось скачать карточку. Попробуй ещё раз");
    } finally {
      setBusyAction(null);
    }
  }

  function retryPreview() {
    setImageFailed(false);
    setPreviewKey((value) => value + 1);
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
      {compact ? (
        <DialogTrigger asChild>
          <Button
            aria-label="Поделиться итогами"
            className="shrink-0 border-border/85 bg-background/55 hover:border-primary/45"
            size="icon"
            title="Поделиться итогами"
            type="button"
            variant="outline"
          >
            <Share2 aria-hidden="true" className="size-4" />
          </Button>
        </DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button className="w-full" type="button" variant="outline">
            <Share2 aria-hidden="true" data-icon="inline-start" />
            Поделиться итогами
          </Button>
        </DialogTrigger>
      )}
      <DialogContent aria-describedby={undefined} className="max-h-[94dvh] gap-0 overflow-y-auto p-0 sm:max-w-5xl lg:h-[94dvh] lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle>Итоги Гран-при</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 p-4 sm:p-5 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-stretch">
          <div className="overflow-hidden rounded-lg border border-border bg-black lg:min-h-0">
            {imageFailed ? (
              <div className="grid aspect-[4/5] place-items-center p-6 text-center lg:h-full lg:aspect-auto">
                <div className="grid max-w-xs justify-items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
                    <ImageIcon aria-hidden="true" className="size-6" />
                  </span>
                  <p className="font-display text-lg font-bold">Превью пока не загрузилось</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Обнови карточку — данные гонки уже останутся на месте.
                  </p>
                  <Button onClick={retryPreview} size="sm" type="button" variant="secondary">
                    <RefreshCw aria-hidden="true" data-icon="inline-start" />
                    Обновить
                  </Button>
                </div>
              </div>
            ) : (
              <Image
                alt={`Итоги Гран-при: ${raceName}`}
                className="block aspect-[4/5] w-full object-contain lg:h-full lg:aspect-auto"
                height={1350}
                key={previewKey}
                onError={() => setImageFailed(true)}
                src={`${imagePath}?preview=${previewKey}`}
                unoptimized
                width={1080}
              />
            )}
          </div>

          <div className="grid content-start gap-3">
            <Button className="h-12 w-full" disabled={busyAction !== null} onClick={shareImage} type="button">
              {busyAction === "share" ? <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Share2 aria-hidden="true" data-icon="inline-start" />}
              Отправить картинку
            </Button>
            <Button className="h-12 w-full" disabled={busyAction !== null} onClick={downloadImage} type="button" variant="secondary">
              {busyAction === "download" ? <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <Download aria-hidden="true" data-icon="inline-start" />}
              Скачать PNG
            </Button>
            {status ? (
              <p className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm" role="status">
                {status}
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
