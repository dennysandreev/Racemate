"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Heart, MessageCircle, PencilLine, Play, Radio, Send, Share2, UserRound, X } from "lucide-react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import type { SocialFeedResult, SocialMode, SocialPlatform, SocialPost } from "@/types/racemate";

type SocialFeedProps = {
  initialResult: SocialFeedResult;
  platform: SocialPlatform;
  mode: SocialMode;
  filters: { topic: string; team: string; driver: string; race: string };
  personalization: {
    favorites: string[];
    state: "signed-out" | "needs-favorites" | "ready";
  };
};

export function SocialFeed({ initialResult, platform, mode, filters, personalization }: SocialFeedProps) {
  const [items, setItems] = useState(initialResult.items);
  const [cursor, setCursor] = useState(initialResult.nextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ cursor, platform, mode });
      Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
      const response = await fetch(`/api/social-posts?${params.toString()}`);
      if (!response.ok) throw new Error("Не удалось загрузить продолжение ленты.");
      const result = (await response.json()) as SocialFeedResult;
      setItems((current) => [...current, ...result.items]);
      setCursor(result.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Лента временно недоступна.");
    } finally {
      setIsLoading(false);
    }
  }, [cursor, filters, isLoading, mode, platform]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || isLoading) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && void loadMore(), { rootMargin: "360px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, isLoading, loadMore]);

  if (!items.length) {
    const personalEmptyState = mode === "mine"
      ? personalization.state === "signed-out"
        ? {
            actionHref: "/auth?next=%2Fsocial%3Fmode%3Dmine",
            actionLabel: "Войти",
            description: "После входа здесь появятся публикации о выбранной команде и пилотах.",
            title: "Войдите, чтобы открыть свою ленту",
          }
        : personalization.state === "needs-favorites"
          ? {
              actionHref: "/onboarding",
              actionLabel: "Выбрать команду и пилотов",
              description: "Выберите любимую команду и до двух пилотов. RaceMate соберет их публикации в одной ленте.",
              title: "Настройте свою ленту",
            }
          : {
              actionHref: "/onboarding",
              actionLabel: "Изменить выбор",
              description: "Новых публикаций о ваших фаворитах пока нет. Они появятся здесь после проверки RaceMate.",
              title: "Пока нет новых публикаций",
            }
      : null;

    return (
      <div className="stitch-panel grid min-h-48 place-items-center p-6 text-center">
        <div className="max-w-md">
          {personalEmptyState?.actionLabel === "Войти"
            ? <UserRound aria-hidden="true" className="mx-auto size-7 text-muted-foreground" />
            : <Radio aria-hidden="true" className="mx-auto size-7 text-muted-foreground" />}
          <h2 className="mt-3 font-display text-lg font-bold">{personalEmptyState?.title ?? "Здесь пока тихо"}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {personalEmptyState?.description ?? "По выбранным фильтрам нет обработанных публикаций. Попробуйте изменить параметры."}
          </p>
          {personalEmptyState ? (
            <Button asChild className="mt-4" size="sm">
              <Link href={personalEmptyState.actionHref}>{personalEmptyState.actionLabel}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden border-y border-border/70 bg-card/35 sm:rounded-md sm:border">
      {mode === "mine" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider px-4 py-3">
          <p className="min-w-0 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">В вашей ленте:</span>{" "}
            {personalization.favorites.join(", ")}
          </p>
          <Button asChild size="sm" variant="ghost">
            <Link href="/onboarding">
              <PencilLine aria-hidden="true" className="size-3.5" />
              Изменить
            </Link>
          </Button>
        </div>
      ) : null}
      <div className="divide-y stitch-divider">
        {items.map((item) => <SocialPostCard item={item} key={item.id} />)}
      </div>
      <div ref={sentinelRef} />
      {isLoading ? <p className="py-4 text-center text-sm text-muted-foreground">Обновляем ленту...</p> : null}
      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t stitch-divider p-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={loadMore} size="sm" type="button" variant="secondary">Повторить</Button>
        </div>
      ) : null}
      {!cursor ? <p className="border-t stitch-divider py-4 text-center text-xs text-muted-foreground">Вы посмотрели все публикации.</p> : null}
    </div>
  );
}

function SocialPostCard({ item }: { item: SocialPost }) {
  const media = item.media.filter((entry) => entry.type === "image" || entry.type === "video" || entry.previewUrl);
  const hasVideo = media.some((entry) => entry.type === "video");

  return (
    <article className={`grid gap-4 p-4 transition-colors hover:bg-muted/30 sm:p-5 ${media.length || item.imageUrl ? "md:grid-cols-[minmax(0,1fr)_18rem]" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <PlatformMark platform={item.platform} />
          <span className="font-semibold text-foreground">{item.source}</span>
          <span aria-hidden="true">·</span>
          <span>{item.publishedAt}</span>
        </div>
        {item.title ? <h2 className="mt-3 font-display text-lg font-bold leading-6">{item.title}</h2> : null}
        {item.summary ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.summary}</p> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 5).map((tag) => (
            <Link className="rounded-sm border border-border/70 px-2 py-1 text-[0.68rem] font-medium transition-colors hover:border-primary/60 hover:text-primary" href={`/social?${tag.type === "social_topic" ? "topic" : tag.type}=${tag.slug}`} key={`${tag.type}-${tag.slug}`}>
              {tag.name}
            </Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!hasVideo ? (
            <Button asChild size="sm" variant="secondary">
              <a href={item.originalUrl} rel="noreferrer" target="_blank">Оригинал <ExternalLink aria-hidden="true" className="size-3.5" /></a>
            </Button>
          ) : null}
          <Metric icon={Heart} value={item.reactionCount} />
          <Metric icon={MessageCircle} value={item.commentCount} />
          <Metric icon={Share2} value={item.repostCount} />
          <Metric icon={Eye} value={item.viewCount} />
        </div>
      </div>
      {media.length || item.imageUrl ? <SocialMediaCarousel fallbackUrl={item.imageUrl} media={media} originalUrl={item.originalUrl} /> : null}
    </article>
  );
}

function SocialMediaCarousel({
  fallbackUrl,
  media,
  originalUrl,
}: {
  fallbackUrl?: string;
  media: SocialPost["media"];
  originalUrl: string;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const slides = media.length
    ? media.map((entry) => ({
      altText: entry.altText,
      id: entry.id,
      type: entry.type,
      url: entry.type === "video" ? "" : entry.previewUrl ?? entry.url,
    }))
    : fallbackUrl
      ? [{ altText: undefined, id: `fallback-${fallbackUrl}`, type: "image" as const, url: fallbackUrl }]
      : [];

  const moveTo = useCallback((index: number) => {
    const viewport = viewportRef.current;
    if (!viewport || !slides.length) return;
    const nextIndex = Math.min(Math.max(index, 0), slides.length - 1);
    viewport.scrollTo({ left: viewport.clientWidth * nextIndex, behavior: "smooth" });
    setActiveIndex(nextIndex);
  }, [slides.length]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  if (!slides.length) return null;

  return (
    <div className="relative order-first aspect-[4/3] min-w-0 overflow-hidden rounded-sm bg-muted/60 md:order-last">
      <div
        aria-label={`Медиа публикации, ${slides.length}`}
        className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
          const viewport = event.currentTarget;
          scrollFrameRef.current = requestAnimationFrame(() => {
            const nextIndex = Math.round(viewport.scrollLeft / Math.max(viewport.clientWidth, 1));
            setActiveIndex(Math.min(Math.max(nextIndex, 0), slides.length - 1));
          });
        }}
        ref={viewportRef}
        role="region"
      >
        {slides.map((slide, index) => (
          <div className="relative h-full min-w-full snap-start bg-black/5" key={slide.id}>
            {slide.type === "video" ? (
              <VideoSourceLink index={index} originalUrl={originalUrl} total={slides.length} />
            ) : (
              <button
                aria-label={`Открыть изображение ${index + 1} из ${slides.length}`}
                className="relative size-full cursor-zoom-in touch-pan-x"
                onClick={() => setLightboxIndex(index)}
                type="button"
              >
                <Image
                  alt={slide.altText || `Изображение ${index + 1} из ${slides.length}`}
                  className="object-contain"
                  fill
                  sizes="(max-width: 768px) calc(100vw - 2rem), 18rem"
                  src={slide.url}
                  unoptimized
                />
              </button>
            )}
          </div>
        ))}
      </div>

      {slides.length > 1 ? (
        <>
          <span className="pointer-events-none absolute right-2 top-2 rounded-sm bg-background/90 px-2 py-1 font-mono text-[0.65rem] font-bold tabular-nums text-foreground">
            {activeIndex + 1} / {slides.length}
          </span>
          <button
            aria-label="Предыдущее изображение"
            className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-foreground transition-colors hover:bg-background disabled:opacity-35"
            disabled={activeIndex === 0}
            onClick={() => moveTo(activeIndex - 1)}
            title="Предыдущее изображение"
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Следующее изображение"
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-foreground transition-colors hover:bg-background disabled:opacity-35"
            disabled={activeIndex === slides.length - 1}
            onClick={() => moveTo(activeIndex + 1)}
            title="Следующее изображение"
            type="button"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </>
      ) : null}
      {lightboxIndex !== null ? (
        <SocialMediaLightbox
          activeIndex={lightboxIndex}
          onActiveIndexChange={(index) => {
            setLightboxIndex(index);
            setActiveIndex(index);
          }}
          onClose={() => {
            moveTo(lightboxIndex);
            setLightboxIndex(null);
          }}
          originalUrl={originalUrl}
          slides={slides}
        />
      ) : null}
    </div>
  );
}

function SocialMediaLightbox({
  activeIndex,
  onActiveIndexChange,
  onClose,
  originalUrl,
  slides,
}: {
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
  originalUrl: string;
  slides: { altText?: string; id: string; type: string; url: string }[];
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && activeIndex > 0) onActiveIndexChange(activeIndex - 1);
      if (event.key === "ArrowRight" && activeIndex < slides.length - 1) onActiveIndexChange(activeIndex + 1);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeIndex, onActiveIndexChange, onClose, slides.length]);

  const slide = slides[activeIndex];
  if (!slide) return null;

  return createPortal(
    <div
      aria-label="Просмотр медиа"
      aria-modal="true"
      className="fixed inset-0 z-50 grid bg-black/95 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between sm:inset-x-6 sm:top-6">
        <span className="rounded-sm bg-black/70 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-white">
          {activeIndex + 1} / {slides.length}
        </span>
        <button
          aria-label="Закрыть"
          className="pointer-events-auto grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          onClick={onClose}
          title="Закрыть"
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      <div className="relative mx-auto h-[calc(100dvh-1.5rem)] w-full max-w-[100rem] sm:h-[calc(100dvh-3rem)]">
        {slide.type === "video" ? (
          <VideoSourceLink index={activeIndex} originalUrl={originalUrl} total={slides.length} />
        ) : (
          <Image
            alt={slide.altText || `Изображение ${activeIndex + 1} из ${slides.length}`}
            className="object-contain"
            fill
            priority
            sizes="100vw"
            src={slide.url}
            unoptimized
          />
        )}
      </div>

      {slides.length > 1 ? (
        <>
          <button
            aria-label="Предыдущее изображение в полноэкранном режиме"
            className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85 disabled:opacity-30 sm:left-6"
            disabled={activeIndex === 0}
            onClick={() => onActiveIndexChange(activeIndex - 1)}
            title="Предыдущее изображение"
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-6" />
          </button>
          <button
            aria-label="Следующее изображение в полноэкранном режиме"
            className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85 disabled:opacity-30 sm:right-6"
            disabled={activeIndex === slides.length - 1}
            onClick={() => onActiveIndexChange(activeIndex + 1)}
            title="Следующее изображение"
            type="button"
          >
            <ChevronRight aria-hidden="true" className="size-6" />
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}

function VideoSourceLink({
  index,
  originalUrl,
  total,
}: {
  index: number;
  originalUrl: string;
  total: number;
}) {
  return (
    <a
      aria-label={`Смотреть видео ${index + 1} из ${total} в источнике`}
      className="group flex size-full min-h-40 flex-col items-center justify-center gap-3 bg-muted/40 px-6 text-center text-foreground transition-colors hover:bg-muted/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-muted/75"
      href={originalUrl}
      rel="noreferrer"
      target="_blank"
    >
      <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
        <Play aria-hidden="true" className="ml-0.5 size-5" fill="currentColor" />
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
        Смотреть видео в источнике
        <ExternalLink aria-hidden="true" className="size-3.5" />
      </span>
    </a>
  );
}

function PlatformMark({ platform }: { platform: SocialPost["platform"] }) {
  const Icon = platform === "telegram" ? Send : platform === "reddit" ? MessageCircle : Radio;
  return <span className="inline-flex items-center gap-1 font-mono font-bold uppercase text-primary"><Icon aria-hidden="true" className="size-3.5" />{platform === "telegram" ? "TG" : platform}</span>;
}

function Metric({ icon: Icon, value }: { icon: typeof Heart; value?: number }) {
  if (value === undefined || value <= 0) return null;
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Icon aria-hidden="true" className="size-3.5" />{new Intl.NumberFormat("ru", { notation: value > 999 ? "compact" : "standard" }).format(value)}</span>;
}
