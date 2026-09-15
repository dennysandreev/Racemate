"use client";

import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  removeFantasyLeagueAvatar,
  uploadFantasyLeagueAvatar,
} from "@/app/fantasy/league-avatar-actions";
import { FantasyLeagueAvatar } from "@/components/fantasy/fantasy-league-avatar";
import {
  FANTASY_LEAGUE_AVATAR_DIMENSION,
  FANTASY_LEAGUE_AVATAR_MAX_BYTES,
} from "@/lib/fantasy-league-avatar";
import { cn } from "@/lib/utils";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function FantasyLeagueAvatarUploader({
  avatarUrl,
  canEdit,
  className,
  leagueId,
  leagueName,
}: {
  avatarUrl?: string | null;
  canEdit: boolean;
  className?: string;
  leagueId: string;
  leagueName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState(avatarUrl ?? null);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    if (!SUPPORTED_SOURCE_TYPES.has(file.type) || file.size > MAX_SOURCE_BYTES) {
      toast.error("Выбери JPG, PNG или WebP размером до 10 МБ.");
      resetInput();
      return;
    }

    try {
      const avatar = await resizeAvatar(file);
      const formData = new FormData();
      formData.set("avatar", avatar, "avatar.webp");
      formData.set("leagueId", leagueId);

      startTransition(async () => {
        const result = await uploadFantasyLeagueAvatar(formData);

        if (!result.ok) {
          toast.error(result.message);
          return;
        }

        setPreviewUrl(result.avatarUrl ?? null);
        toast.success(result.message);
        router.refresh();
        resetInput();
      });
    } catch {
      toast.error("Не получилось обработать изображение. Выбери другой файл.");
      resetInput();
    }
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeFantasyLeagueAvatar(leagueId);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setPreviewUrl(null);
      toast.success(result.message);
      router.refresh();
    });
  }

  function resetInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("relative size-18 shrink-0 sm:size-20", className)}>
      <FantasyLeagueAvatar
        avatarUrl={previewUrl}
        className="size-full border-primary/45 text-lg"
        name={leagueName}
      />
      {canEdit ? (
        <>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={isPending}
            onChange={(event) => void handleFile(event.target.files?.[0])}
            ref={inputRef}
            type="file"
          />
          <button
            aria-label="Загрузить обложку лиги"
            className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border border-border bg-background text-foreground shadow-lg transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
            title="Загрузить обложку"
            type="button"
          >
            {isPending ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Camera aria-hidden="true" className="size-4" />
            )}
          </button>
          {previewUrl && !isPending ? (
            <button
              aria-label="Удалить обложку лиги"
              className="absolute -bottom-1 -left-1 grid size-7 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-lg transition-colors hover:border-destructive hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={handleRemove}
              title="Удалить обложку"
              type="button"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

async function resizeAvatar(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const sourceSize = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.max(0, (bitmap.width - sourceSize) / 2);
  const sourceY = Math.max(0, (bitmap.height - sourceSize) / 2);
  const canvas = document.createElement("canvas");

  canvas.width = FANTASY_LEAGUE_AVATAR_DIMENSION;
  canvas.height = FANTASY_LEAGUE_AVATAR_DIMENSION;

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("canvas_unavailable");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    FANTASY_LEAGUE_AVATAR_DIMENSION,
    FANTASY_LEAGUE_AVATAR_DIMENSION,
  );
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.58, 0.46]) {
    const blob = await canvasToWebp(canvas, quality);
    if (blob.size <= FANTASY_LEAGUE_AVATAR_MAX_BYTES) return blob;
  }

  throw new Error("avatar_too_large");
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("webp_encoding_failed"))),
      "image/webp",
      quality,
    );
  });
}
