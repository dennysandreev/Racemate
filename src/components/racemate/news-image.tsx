"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

type NewsImageProps = {
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  src?: string;
};

export function NewsImage({ alt, className, priority = false, sizes = "(max-width: 768px) 100vw, 48rem", src }: NewsImageProps) {
  const [failedSrc, setFailedSrc] = useState<string>();

  if (!src) {
    return null;
  }

  const containerClassName =
    className ??
    "relative aspect-video overflow-hidden rounded-lg border border-border bg-muted";

  if (failedSrc === src) {
    return (
      <div
        aria-hidden="true"
        className={cn(containerClassName, "grid place-items-center text-muted-foreground/55")}
      >
        <ImageOff className="size-8" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <Image
        alt={alt}
        className="object-cover"
        fill
        onError={() => setFailedSrc(src)}
        priority={priority}
        sizes={sizes}
        src={src}
      />
    </div>
  );
}
