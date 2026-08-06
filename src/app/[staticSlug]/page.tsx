import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/racemate/app-shell";
import {
  PlaceholderPageView,
  StaticDocumentPageView,
} from "@/components/racemate/static-info-page";
import { placeholderPages, staticDocumentPages } from "@/content/static-pages";
import { createPageMetadata } from "@/lib/seo";

type StaticPageProps = {
  params: Promise<{ staticSlug: string }>;
};

export function generateStaticParams() {
  return [
    ...Object.keys(staticDocumentPages),
    ...Object.keys(placeholderPages),
  ].map((staticSlug) => ({ staticSlug }));
}

export async function generateMetadata({ params }: StaticPageProps): Promise<Metadata> {
  const { staticSlug } = await params;
  const documentPage = staticDocumentPages[staticSlug as keyof typeof staticDocumentPages];
  const placeholderPage = placeholderPages[staticSlug as keyof typeof placeholderPages];
  const page = documentPage ?? placeholderPage;

  if (!page) {
    return createPageMetadata({
      description: "Страница не найдена.",
      noIndex: true,
      path: `/${staticSlug}`,
      title: "Страница не найдена",
    });
  }

  return createPageMetadata({
    description: page.description,
    noIndex: Boolean(placeholderPage),
    path: `/${staticSlug}`,
    title: page.title,
  });
}

export default async function StaticPage({ params }: StaticPageProps) {
  const { staticSlug } = await params;
  const documentPage = staticDocumentPages[staticSlug as keyof typeof staticDocumentPages];
  const placeholderPage = placeholderPages[staticSlug as keyof typeof placeholderPages];

  if (!documentPage && !placeholderPage) {
    notFound();
  }

  return (
    <AppShell>
      {documentPage ? (
        <StaticDocumentPageView page={documentPage} />
      ) : (
        <PlaceholderPageView page={placeholderPage} />
      )}
    </AppShell>
  );
}
