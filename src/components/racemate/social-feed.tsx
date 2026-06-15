"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Heart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import type {
  SocialFeedResult,
  SocialPlatform,
  SocialPost,
  SocialSort,
} from "@/types/racemate";

type SocialFeedProps = {
  initialResult: SocialFeedResult;
  platform: SocialPlatform;
  sort: SocialSort;
};

export function SocialFeed({ initialResult, platform, sort }: SocialFeedProps) {
  const [items, setItems] = useState(initialResult.items);
  const [cursor, setCursor] = useState(initialResult.nextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        cursor,
        platform,
        sort,
      });
      const response = await fetch(`/api/social-posts?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Не удалось загрузить следующую страницу.");
      }

      const result = (await response.json()) as SocialFeedResult;

      setItems((current) => [...current, ...result.items]);
      setCursor(result.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Лента не ответила.");
    } finally {
      setIsLoading(false);
    }
  }, [cursor, isLoading, platform, sort]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !cursor || isLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "360px" },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [cursor, isLoading, loadMore, platform, sort]);

  if (!items.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-sm leading-6 text-muted-foreground">
        Пока нет постов для выбранного фильтра. Старые записи не удаляются, поэтому лента
        вернётся, когда worker получит первый успешный ответ от источников.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <SocialPostCard item={item} key={item.id} />
      ))}

      <div ref={sentinelRef} />

      {isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Загружаем ещё посты…</p>
      ) : null}

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted p-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={loadMore} size="sm" type="button" variant="secondary">
            Попробовать ещё раз
          </Button>
        </div>
      ) : null}

      {!cursor && items.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Это все посты в кеше RaceMate.
        </p>
      ) : null}
    </div>
  );
}

function SocialPostCard({ item }: { item: SocialPost }) {
  return (
    <Card className="overflow-hidden transition-colors hover:bg-accent/45">
      <CardContent className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.platform === "x" ? "outline" : "secondary"}>
              {item.platform === "x" ? "X" : "Reddit"}
            </Badge>
            <span className="text-sm font-medium">{item.author}</span>
            <span className="text-xs text-muted-foreground">{item.publishedAt}</span>
            {item.reactionCount !== undefined ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Heart aria-hidden="true" className="size-3" />
                {item.reactionCount}
              </span>
            ) : null}
          </div>

          <h2 className="mt-3 text-base font-semibold leading-6">{item.title}</h2>
          {item.body && item.body !== item.title ? (
            <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">
              {item.body}
            </p>
          ) : null}

          <Button asChild className="mt-4" size="sm" variant="secondary">
            <a href={item.originalUrl} rel="noreferrer" target="_blank">
              Открыть оригинал
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </Button>
        </div>

        {item.imageUrl ? (
          <a
            className="relative block min-h-48 overflow-hidden rounded-md border border-border/70 bg-background"
            href={item.originalUrl}
            rel="noreferrer"
            target="_blank"
          >
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="(max-width: 640px) 100vw, 12rem"
              src={item.imageUrl}
              unoptimized
            />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
