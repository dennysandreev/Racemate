import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Flag, Gauge, Share2, Trophy, Users } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { StitchPanel, StitchPanelHeader } from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getPublicPredictionShareBySlug,
  normalizePredictionShareScope,
} from "@/data/racemate-repository";
import type { PredictionShareDriverPick, PublicPredictionShare } from "@/types/racemate";

type PredictionPageProps = {
  params: Promise<{ shareSlug: string }>;
  searchParams: Promise<{ scope?: string }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PredictionPageProps): Promise<Metadata> {
  const { shareSlug } = await params;
  const { scope: rawScope } = await searchParams;
  const scope = normalizePredictionShareScope(rawScope);
  const share = await getPublicPredictionShareBySlug(shareSlug, scope);

  if (!share) {
    return {
      title: "Прогноз не найден · RaceMate",
    };
  }

  const title = `${share.displayName}: прогноз на ${share.race.name} · RaceMate`;
  const description = scope === "qualification"
    ? `Прогноз на стартовую решетку ${share.race.name}.`
    : `Топ-10 и спецпрогнозы на ${share.race.name}.`;

  return {
    description,
    openGraph: {
      description,
      images: [share.ogImageUrl],
      title,
      url: share.publicUrl,
    },
    title,
    twitter: {
      card: "summary_large_image",
      images: [share.ogImageUrl],
    },
  };
}

export default async function PredictionSharePage({
  params,
  searchParams,
}: PredictionPageProps) {
  const { shareSlug } = await params;
  const { scope: rawScope } = await searchParams;
  const scope = normalizePredictionShareScope(rawScope);
  const share = await getPublicPredictionShareBySlug(shareSlug, scope);

  if (!share) {
    notFound();
  }

  return (
    <AppShell>
      <div className="grid gap-6 py-6">
        <section className="stitch-panel overflow-hidden p-5 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="danger">Прогноз RaceMate</Badge>
                <Badge variant="outline">
                  {scope === "qualification" ? "Квалификация" : "Гонка"}
                </Badge>
                {share.race.round ? <Badge variant="secondary">Раунд {share.race.round}</Badge> : null}
              </div>
              <h1 className="font-display max-w-4xl text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
                {share.race.name}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                {share.displayName} поделился прогнозом
                {share.leagueName ? ` из лиги «${share.leagueName}»` : ""}.
              </p>
            </div>
            <Button asChild className="h-12 justify-center">
              <Link href="/fantasy">
                <Share2 aria-hidden="true" data-icon="inline-start" />
                Сделать свой прогноз
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
          <StitchPanel className="overflow-hidden">
            <Image
              alt={`Прогноз RaceMate на ${share.race.name}`}
              className="h-auto w-full"
              height={scope === "qualification" ? 630 : 1350}
              priority
              src={share.shareImageUrl}
              unoptimized
              width={scope === "qualification" ? 1200 : 1080}
            />
          </StitchPanel>

          <aside className="grid gap-5">
            <PredictionSummaryCard share={share} />
            <StitchPanel>
              <StitchPanelHeader icon={Users} title="Дополнительные прогнозы" />
              <div className="grid gap-2 p-4">
                <DataLine label="Поул" value={share.picks.pole?.name ?? "—"} />
                {scope === "race" ? (
                  <>
                    <DataLine label="Лучший круг" value={share.picks.fastestLap?.name ?? "—"} />
                    <DataLine label="Первый сход" value={share.picks.dnfKind === "none" ? "Без DNF" : share.picks.dnf?.name ?? "—"} />
                    <DataLine label="Команда этапа" value={share.picks.topScoringTeam?.name ?? "—"} />
                    <DataLine label="Быстрый пит-стоп" value={share.picks.fastestPitStopTeam?.name ?? "—"} />
                  </>
                ) : null}
              </div>
            </StitchPanel>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function PredictionSummaryCard({ share }: { share: PublicPredictionShare }) {
  const title = share.scope === "qualification" ? "Стартовая решетка" : "Топ-10 гонки";
  const drivers = share.scope === "qualification"
    ? [share.picks.pole].filter((driver): driver is PredictionShareDriverPick => Boolean(driver))
    : share.picks.top10;

  return (
    <StitchPanel>
      <StitchPanelHeader icon={Trophy} title={title} />
      <div className="grid gap-2 p-4">
        {drivers.length ? drivers.map((driver, index) => (
          <div
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 rounded-md border border-border bg-background/35 p-3"
            key={`${driver.id}-${index}`}
          >
            <span className="font-telemetry text-sm font-bold text-primary">
              {share.scope === "qualification" ? "PO" : `P${index + 1}`}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{driver.name}</p>
              <p className="truncate text-sm text-muted-foreground">{driver.team?.name ?? "Команда уточняется"}</p>
            </div>
          </div>
        )) : (
          <p className="rounded-md border border-border bg-background/35 p-4 text-sm text-muted-foreground">
            Выбор появится после сохранения прогноза.
          </p>
        )}
      </div>
    </StitchPanel>
  );
}

function DataLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/35 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {label === "Лучший круг" ? <Gauge aria-hidden="true" className="size-4" /> : <Flag aria-hidden="true" className="size-4" />}
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm font-semibold">{value}</span>
    </div>
  );
}
