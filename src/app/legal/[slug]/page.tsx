import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/racemate/app-shell";
import { StaticDocumentPageView } from "@/components/racemate/static-info-page";
import { legalPages } from "@/content/static-pages";
import { createPageMetadata } from "@/lib/seo";

type LegalPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return Object.keys(legalPages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = legalPages[slug as keyof typeof legalPages];

  if (!page) {
    return createPageMetadata({
      description: "Документ не найден.",
      noIndex: true,
      path: `/legal/${slug}`,
      title: "Документ не найден",
    });
  }

  return createPageMetadata({
    description: page.description,
    path: `/legal/${slug}`,
    title: page.title,
  });
}

export default async function LegalPage({ params }: LegalPageProps) {
  const { slug } = await params;
  const page = legalPages[slug as keyof typeof legalPages];

  if (!page) {
    notFound();
  }

  return (
    <AppShell>
      <StaticDocumentPageView page={page} />
    </AppShell>
  );
}
