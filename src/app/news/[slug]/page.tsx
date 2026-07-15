import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Flame, Newspaper } from "lucide-react";
import { notFound } from "next/navigation";
import { cache } from "react";

import { reactToArticle } from "@/app/news/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { ArticleShareActions } from "@/components/racemate/article-share-actions";
import { NewsImage } from "@/components/racemate/news-image";
import { NewsTagBadge } from "@/components/racemate/news-tag-badge";
import {
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getArticleReactionCounts,
  getNewsArticle,
  getNewsItems,
} from "@/data/racemate-repository";
import { getSiteUrl } from "@/lib/env";
import { getOrCreateNewsShareUrl } from "@/lib/share-links";

type NewsArticlePageProps = {
  params: Promise<{ slug: string }>;
};

const getCachedNewsArticle = cache(getNewsArticle);

export async function generateMetadata({
  params,
}: NewsArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getCachedNewsArticle(slug);

  if (!article) {
    return { title: "Новость не найдена · RaceMate" };
  }

  const canonicalUrl = buildArticleUrl(article.slug);
  const description = buildMetadataDescription(article.summary);
  const imageUrl = toAbsoluteUrl(article.imageUrl);
  const title = `${article.title} · RaceMate`;

  return {
    alternates: { canonical: canonicalUrl },
    description,
    openGraph: {
      description,
      locale: "ru_RU",
      siteName: "RaceMate",
      title,
      type: "article",
      url: canonicalUrl,
      ...(imageUrl ? { images: [{ alt: article.title, url: imageUrl }] } : {}),
    },
    title,
    twitter: {
      card: "summary_large_image",
      description,
      title,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default async function NewsArticlePage({
  params,
}: NewsArticlePageProps) {
  const { slug } = await params;
  const article = await getCachedNewsArticle(slug);

  if (!article) {
    notFound();
  }

  const canonicalUrl = buildArticleUrl(article.slug);
  const [reactions, latestNews, shareUrl] = await Promise.all([
    getArticleReactionCounts(article.slug),
    getNewsItems({ pageSize: 4 }),
    getOrCreateNewsShareUrl(article.slug, canonicalUrl),
  ]);
  const detailParagraphs = splitArticleDetails(article.details);

  return (
    <AppShell>
      <header className="border-b border-border py-5 sm:py-6">
        <h1 className="font-display max-w-5xl text-balance text-2xl font-extrabold leading-tight tracking-[-0.03em] sm:text-4xl">
          {article.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{article.source}</span>
          <span aria-hidden="true">·</span>
          <span>{article.time}</span>
        </div>
      </header>

      <section className="grid gap-5 py-5 sm:py-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="stitch-panel p-5 sm:p-6">
          {article.tags.length || article.raceTag ? (
            <div className="flex flex-wrap items-center gap-2">
              {article.tags.map((tag) => (
                <NewsTagBadge href={`/news?tag=${tag.slug}`} key={tag.slug} tag={tag} />
              ))}
              {article.raceTag && !article.tags.some((tag) => tag.type === "race") ? (
                <Link href={article.raceFilter ? `/news?race=${article.raceFilter}` : "/news"}>
                  <Badge variant="warning">{article.raceTag}</Badge>
                </Link>
              ) : null}
            </div>
          ) : null}
          <HighlightedParagraph
            className="mt-5 max-w-[72ch] text-lg leading-8 text-foreground"
            highlights={article.highlights ?? []}
            text={article.summary}
          />
          <NewsImage
            alt=""
            className="relative mt-6 aspect-video overflow-hidden rounded-lg border border-border bg-muted"
            priority
            src={article.imageUrl}
          />
          {detailParagraphs.length ? (
            <div className="mt-5 grid max-w-[72ch] gap-4 text-base leading-7 text-muted-foreground">
              {detailParagraphs.map((paragraph) => (
                <HighlightedParagraph
                  className="text-pretty"
                  highlights={article.highlights ?? []}
                  key={paragraph}
                  text={paragraph}
                />
              ))}
            </div>
          ) : (
            <p className="mt-5 max-w-[72ch] text-base leading-7 text-muted-foreground">
              Подробности появятся после обработки материала.
            </p>
          )}
          {article.keyPoints?.length ? (
            <div className="mt-6 grid gap-2">
              {article.keyPoints.map((point) => (
                <p
                  className="rounded-md border border-border/70 bg-muted px-3 py-2 text-sm text-muted-foreground"
                  key={point}
                >
                  {point}
                </p>
              ))}
            </div>
          ) : null}
          {article.href ? (
            <Button asChild className="mt-6" variant="secondary">
              <Link href={article.href} rel="noreferrer" target="_blank">
                Открыть оригинал
                <ExternalLink aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          ) : null}
        </article>

        <aside className="grid content-start gap-5">
          <StitchPanel>
            <StitchPanelHeader icon={Flame} title="Оцени и поделись" />
            <div className="p-3">
              <form action={reactToArticle} className="flex flex-wrap gap-2">
                <input name="articleId" type="hidden" value={article.slug} />
                {Object.entries(reactions).map(([reaction, count]) => (
                  <Button className="min-w-20 justify-between" key={reaction} name="reaction" type="submit" value={reaction} variant="secondary">
                    {reaction}
                    <Badge variant="outline">{count}</Badge>
                  </Button>
                ))}
              </form>
            </div>
            <ArticleShareActions shareUrl={shareUrl} title={article.title} />
          </StitchPanel>

          <StitchPanel>
            <StitchPanelHeader icon={Newspaper} title="Свежие материалы" />
            <div className="grid gap-2 p-4">
              {latestNews.items
                .filter((item) => item.slug !== article.slug)
                .slice(0, 3)
                .map((item) => (
                  <Link
                    className="rounded-md border border-border bg-background/35 p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/news/${item.slug}`}
                    key={item.slug}
                  >
                    <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{item.time}</p>
                  </Link>
                ))}
            </div>
          </StitchPanel>
        </aside>
      </section>
    </AppShell>
  );
}

function splitArticleDetails(details?: string) {
  return (details ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function HighlightedParagraph({
  className,
  highlights,
  text,
}: {
  className?: string;
  highlights: string[];
  text: string;
}) {
  const phrases = highlights
    .map((highlight) => highlight.trim())
    .filter((highlight) => highlight.length >= 4 && text.toLowerCase().includes(highlight.toLowerCase()))
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);

  if (!phrases.length) {
    return <p className={className}>{text}</p>;
  }

  const pattern = new RegExp(`(${phrases.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern).filter(Boolean);

  return (
    <p className={className}>
      {parts.map((part, index) =>
        phrases.some((phrase) => phrase.toLowerCase() === part.toLowerCase()) ? (
          <mark
            className="bg-transparent font-medium text-foreground decoration-2 decoration-primary underline underline-offset-4"
            key={`${part}-${index}`}
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </p>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildArticleUrl(articleId: string) {
  return `${getSiteUrl().replace(/\/+$/, "")}/news/${articleId}`;
}

function buildMetadataDescription(summary: string) {
  const normalized = summary.replace(/\s+/g, " ").trim();

  return normalized.length > 180 ? `${normalized.slice(0, 177).trimEnd()}...` : normalized;
}

function toAbsoluteUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value, getSiteUrl()).toString();
  } catch {
    return undefined;
  }
}
