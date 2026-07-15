import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  CheckCircle2,
  CircleDashed,
  Flag,
  Gauge,
  ListOrdered,
  Share2,
  Timer,
  Trophy,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { StitchPanel, StitchPanelHeader } from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getPublicPredictionShareBySlug,
  getPublicPredictionSharePageContext,
  normalizePredictionShareScope,
} from "@/data/racemate-repository";
import { cn } from "@/lib/utils";
import type {
  PredictionQualificationOutcome,
  PredictionShareDriverPick,
  PredictionShareScope,
  PublicPredictionShare,
  PublicPredictionSharePageContext,
} from "@/types/racemate";

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

  const title = scope === "qualification"
    ? `${share.displayName}: прогноз на поул · ${share.race.name} · RaceMate`
    : `${share.displayName}: прогноз на гонку ${share.race.name} · RaceMate`;
  const availability = getPredictionScopeAvailability(share);
  const description = availability[scope]
    ? scope === "qualification"
      ? `Прогноз на поул: ${share.race.name}.`
      : `Топ-10 и спецпрогнозы на ${share.race.name}.`
    : `Этот прогноз на ${scope === "qualification" ? "квалификацию" : "гонку"} пока не опубликован.`;

  return {
    description,
    openGraph: {
      description,
      title,
      url: share.publicUrl,
      ...(availability[scope] ? { images: [share.ogImageUrl] } : {}),
    },
    title,
    twitter: {
      card: "summary_large_image",
      ...(availability[scope] ? { images: [share.ogImageUrl] } : {}),
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

  const pageContext = await getPublicPredictionSharePageContext(share);
  const availability = getPredictionScopeAvailability(share);
  const activeScopeAvailable = availability[scope];

  return (
    <AppShell>
      <div className="grid gap-6 pb-6">
        <section className="stitch-panel overflow-hidden p-0">
          <div className="p-5 sm:p-8">
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
              </div>
              <Button asChild className="h-12 justify-center">
                <Link href="/fantasy">
                  <Share2 aria-hidden="true" data-icon="inline-start" />
                  Сделать свой прогноз
                </Link>
              </Button>
            </div>

            <PredictionAuthor
              author={pageContext.author}
              displayName={share.displayName}
              leagueName={share.leagueName}
            />
          </div>

          <PredictionScopeNav
            activeScope={scope}
            availability={availability}
            qualificationOutcome={pageContext.qualificationOutcome}
            raceResult={pageContext.raceResult}
            shareSlug={share.shareSlug}
          />
        </section>

        {activeScopeAvailable ? (
          <>
            {scope === "qualification" ? (
              <QualificationOutcomePanel outcome={pageContext.qualificationOutcome} />
            ) : null}

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
              <StitchPanel className="overflow-hidden">
                <Image
                  alt={scope === "qualification"
                    ? `Прогноз RaceMate на поул: ${share.race.name}`
                    : `Прогноз RaceMate на гонку ${share.race.name}`}
                  className="h-auto w-full"
                  height={1350}
                  priority
                  src={share.shareImageUrl}
                  unoptimized
                  width={1080}
                />
              </StitchPanel>

              <aside className="grid gap-5">
                <PredictionSummaryCard share={share} />
                {scope === "race" ? (
                  <StitchPanel>
                    <StitchPanelHeader icon={Users} title="Дополнительные прогнозы" />
                    <div className="grid gap-2 p-4">
                      <DataLine label="Лучший круг" value={share.picks.fastestLap?.name ?? "Не выбран"} />
                      <DataLine label="Первый сход" value={share.picks.dnfKind === "none" ? "Без схода" : share.picks.dnf?.name ?? "Не выбран"} />
                      <DataLine label="Команда этапа" value={share.picks.topScoringTeam?.name ?? "Не выбрана"} />
                      <DataLine label="Быстрый пит-стоп" value={share.picks.fastestPitStopTeam?.name ?? "Не выбрана"} />
                    </div>
                  </StitchPanel>
                ) : null}
              </aside>
            </section>
          </>
        ) : (
          <PredictionScopeEmptyState scope={scope} />
        )}
      </div>
    </AppShell>
  );
}

type PredictionScopeAvailability = Record<PredictionShareScope, boolean>;

function PredictionAuthor({
  author,
  displayName,
  leagueName,
}: {
  author: PublicPredictionSharePageContext["author"];
  displayName: string;
  leagueName: string | null;
}) {
  const hasRank = author.scoredPredictionCount > 0 && author.globalRank !== null;

  return (
    <div className="mt-6 grid gap-4 border-t stitch-divider pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-full border border-primary/45 bg-primary/12 font-display text-base font-extrabold text-primary"
        >
          {getInitials(displayName)}
        </span>
        <div className="min-w-0">
          <p className="font-telemetry flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-primary">
            <UserRound aria-hidden="true" className="size-3.5" />
            Автор прогноза
          </p>
          <p className="mt-1 truncate font-display text-xl font-bold tracking-[-0.025em]">
            {displayName}
          </p>
          {leagueName ? (
            <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
              Лига «{leagueName}»
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t stitch-divider pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40">
          <ListOrdered aria-hidden="true" className="size-4 text-primary" />
        </span>
        <div>
          <p className="font-telemetry text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Общий рейтинг
          </p>
          <p className="mt-1 font-display text-xl font-extrabold leading-none">
            {hasRank ? `#${author.globalRank}` : "Пока без места"}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {hasRank
              ? formatPoints(author.totalScore)
              : "Позиция появится после первых очков"}
          </p>
        </div>
      </div>
    </div>
  );
}

function PredictionScopeNav({
  activeScope,
  availability,
  qualificationOutcome,
  raceResult,
  shareSlug,
}: {
  activeScope: PredictionShareScope;
  availability: PredictionScopeAvailability;
  qualificationOutcome: PredictionQualificationOutcome;
  raceResult: PublicPredictionSharePageContext["raceResult"];
  shareSlug: string;
}) {
  return (
    <nav
      aria-label="Прогнозы участника"
      className="grid grid-cols-2 gap-1 border-t stitch-divider bg-background/25 p-1.5"
    >
      <PredictionScopeLink
        active={activeScope === "qualification"}
        available={availability.qualification}
        href={`/prediction/${encodeURIComponent(shareSlug)}?scope=qualification`}
        label="Квалификация"
        qualificationOutcome={qualificationOutcome}
        raceResult={raceResult}
        scope="qualification"
      />
      <PredictionScopeLink
        active={activeScope === "race"}
        available={availability.race}
        href={`/prediction/${encodeURIComponent(shareSlug)}`}
        label="Гонка"
        qualificationOutcome={qualificationOutcome}
        raceResult={raceResult}
        scope="race"
      />
    </nav>
  );
}

function PredictionScopeLink({
  active,
  available,
  href,
  label,
  qualificationOutcome,
  raceResult,
  scope,
}: {
  active: boolean;
  available: boolean;
  href: string;
  label: string;
  qualificationOutcome: PredictionQualificationOutcome;
  raceResult: PublicPredictionSharePageContext["raceResult"];
  scope: PredictionShareScope;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-16 min-w-0 items-center gap-2 rounded-md border px-2 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:px-4",
        active
          ? "border-primary/55 bg-primary/12"
          : "border-transparent hover:border-border hover:bg-accent/55",
      )}
      href={href}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md border transition-colors sm:size-9",
          active
            ? "border-primary/40 bg-primary text-primary-foreground"
            : "border-border/70 bg-secondary/45 text-muted-foreground group-hover:text-foreground",
        )}
      >
        {scope === "qualification" ? (
          <Timer aria-hidden="true" className="size-4" />
        ) : (
          <Flag aria-hidden="true" className="size-4" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold sm:text-base">{label}</span>
        <PredictionScopeStatus
          available={available}
          qualificationOutcome={qualificationOutcome}
          raceResult={raceResult}
          scope={scope}
        />
      </span>
    </Link>
  );
}

function PredictionScopeStatus({
  available,
  qualificationOutcome,
  raceResult,
  scope,
}: {
  available: boolean;
  qualificationOutcome: PredictionQualificationOutcome;
  raceResult: PublicPredictionSharePageContext["raceResult"];
  scope: PredictionShareScope;
}) {
  if (scope === "race") {
    if (!available) {
      return (
        <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <CircleDashed aria-hidden="true" className="size-3.5" />
          Прогноза нет
        </span>
      );
    }

    if (raceResult.points !== null) {
      return (
        <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-success">
          <Trophy aria-hidden="true" className="size-3.5" />
          {formatPoints(raceResult.points)}
        </span>
      );
    }

    if (raceResult.finished) {
      return (
        <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
          <CircleDashed aria-hidden="true" className="size-3.5" />
          Подсчёт очков
        </span>
      );
    }

    return (
      <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <CheckCircle2 aria-hidden="true" className="size-3.5" />
        Есть прогноз
      </span>
    );
  }

  if (qualificationOutcome === "correct") {
    return (
      <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-success">
        <CheckCircle2 aria-hidden="true" className="size-3.5" />
        Поул угадан
      </span>
    );
  }

  if (qualificationOutcome === "incorrect") {
    return (
      <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-danger">
        <XCircle aria-hidden="true" className="size-3.5" />
        Поул не угадан
      </span>
    );
  }

  return (
    <span className={cn(
      "mt-1 flex items-center gap-1.5 text-xs font-semibold",
      available ? "text-warning" : "text-muted-foreground",
    )}>
      <CircleDashed aria-hidden="true" className="size-3.5" />
      {available ? "Ждём результат" : "Прогноза нет"}
    </span>
  );
}

function QualificationOutcomePanel({
  outcome,
}: {
  outcome: PredictionQualificationOutcome;
}) {
  if (outcome === "not_submitted") {
    return null;
  }

  const result = outcome === "correct"
    ? {
        description: "Выбор автора совпал с результатом квалификации.",
        icon: CheckCircle2,
        title: "Поул угадан",
        tone: "border-success/35 bg-success/10 text-success",
      }
    : outcome === "incorrect"
      ? {
          description: "Выбор автора не совпал с результатом квалификации.",
          icon: XCircle,
          title: "Поул не угадан",
          tone: "border-danger/35 bg-danger/10 text-danger",
        }
      : {
          description: "Статус обновится, когда появятся результаты квалификации.",
          icon: CircleDashed,
          title: "Результат ещё не известен",
          tone: "border-warning/35 bg-warning/10 text-warning",
        };
  const Icon = result.icon;

  return (
    <section className={cn("stitch-panel flex items-start gap-3 border p-4 sm:p-5", result.tone)}>
      <span className="grid size-10 shrink-0 place-items-center rounded-md border border-current/25 bg-background/25">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">{result.title}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
          {result.description}
        </p>
      </div>
    </section>
  );
}

function PredictionScopeEmptyState({ scope }: { scope: PredictionShareScope }) {
  const scopeLabel = scope === "qualification" ? "квалификацию" : "гонку";

  return (
    <section className="stitch-panel grid min-h-80 place-items-center p-7 text-center sm:p-10">
      <div className="max-w-xl">
        <span className="mx-auto grid size-12 place-items-center rounded-md border border-border/70 bg-secondary/40">
          <CircleDashed aria-hidden="true" className="size-5 text-muted-foreground" />
        </span>
        <p className="font-telemetry mt-5 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-primary">
          Прогноз на {scopeLabel}
        </p>
        <h2 className="font-display mt-2 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">
          Пока нет сохранённого прогноза
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-muted-foreground">
          Автор ещё не сохранил этот выбор. Загляните позже или соберите свой прогноз на RaceMate.
        </p>
        <Button asChild className="mt-6 h-11">
          <Link href="/fantasy">
            <Share2 aria-hidden="true" data-icon="inline-start" />
            Сделать свой прогноз
          </Link>
        </Button>
      </div>
    </section>
  );
}

function getPredictionScopeAvailability(share: PublicPredictionShare): PredictionScopeAvailability {
  return {
    qualification: Boolean(share.picks.pole),
    race: share.picks.top10.length > 0
      || Boolean(share.picks.fastestLap)
      || Boolean(share.picks.dnf)
      || share.picks.dnfKind === "none"
      || Boolean(share.picks.topScoringTeam)
      || Boolean(share.picks.fastestPitStopTeam),
  };
}

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "RM";
}

function formatPoints(value: number) {
  const absolute = Math.abs(value);
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;
  const label = mod10 === 1 && mod100 !== 11
    ? "очко"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "очка"
      : "очков";

  return `${new Intl.NumberFormat("ru-RU").format(value)} ${label}`;
}

function PredictionSummaryCard({ share }: { share: PublicPredictionShare }) {
  const title = share.scope === "qualification" ? "Прогноз на поул" : "Топ-10 гонки";
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
              {share.scope === "qualification" ? "POLE" : `P${index + 1}`}
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
