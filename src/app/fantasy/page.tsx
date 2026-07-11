import {
  CheckCircle2,
  ClipboardList,
  Crown,
  Edit3,
  Flag,
  KeyRound,
  ListOrdered,
  Lock,
  Plus,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";

import {
  createFantasyLeague,
  joinFantasyLeague,
  saveFantasyPrediction,
} from "@/app/fantasy/actions";
import { FantasyLockCountdown } from "@/components/fantasy/fantasy-lock-countdown";
import { PredictionShareModalLauncher } from "@/components/fantasy/PredictionShareModal";
import { AppShell } from "@/components/racemate/app-shell";
import { FantasyScoringDialog } from "@/components/racemate/fantasy-scoring-dialog";
import {
  PreviousPredictionResultButton,
  QualifyingResultsButton,
} from "@/components/racemate/fantasy-prediction-tools";
import { GlobalFantasyLeaderboardPanel } from "@/components/racemate/global-fantasy-leaderboard";
import { Top10PredictionPicker } from "@/components/racemate/top10-prediction-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getGlobalFantasyLeaderboard,
  getLeagues,
  getPredictionState,
  buildPredictionShareUrls,
  normalizePredictionShareScope,
  getPublicPredictionShareBySlug,
} from "@/data/racemate-repository";
import { getTeamAsset } from "@/data/f1-assets";
import { getSessionProfileSummary, getSessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type {
  DriverOption,
  LeagueSummary,
  PredictionState,
  TeamOption,
} from "@/types/racemate";

type FantasySearchParams = {
  created?: string;
  deleted?: string;
  joined?: string;
  left?: string;
  league?: string;
  message?: string;
  saved?: string;
  share?: string;
  shareScope?: string;
  tab?: string;
  v?: string;
};

type PredictionField = {
  allowNoDnf?: boolean;
  helper: string;
  label: string;
  name: "poleDriverId" | "fastestLapDriverId" | "dnfDriverId";
  short: string;
  locked?: boolean;
  value?: string | null;
};

type TeamPredictionField = {
  helper: string;
  label: string;
  name: "topScoringTeamId" | "fastestPitStopTeamId";
  short: string;
  locked?: boolean;
  value?: string | null;
};

export default async function FantasyPage({
  searchParams,
}: {
  searchParams: Promise<FantasySearchParams>;
}) {
  const [status, user] = await Promise.all([searchParams, getSessionUser()]);
  const activeTab = status.tab === "leagues" || status.tab === "leaderboard" ? status.tab : "picks";
  const [predictionState, leagues, leaderboard, profileSummary] = await Promise.all([
    getPredictionState(user?.id),
    getLeagues(user?.id),
    getGlobalFantasyLeaderboard(),
    getSessionProfileSummary(),
  ]);
  const myLeagues = leagues.filter((league) => league.isMember || league.isOwner);
  const openLeagues = leagues.filter((league) => !league.isMember && !league.isOwner);
  const current = predictionState.current;
  const picks = buildPredictionFields(current, predictionState.race);
  const teamPicks = buildTeamPredictionFields(current, predictionState.race);
  const completedTop10 = current?.top10DriverIds?.length ?? 0;
  const completedRaceSpecials = picks.slice(1).filter((pick) =>
    pick.name === "dnfDriverId" && current?.dnfPickKind === "none"
      ? true
      : Boolean(pick.value),
  ).length;
  const completedTeamPicks = teamPicks.filter((pick) => Boolean(pick.value)).length;
  const completedQualificationPicks = current?.poleDriverId ? 1 : 0;
  const completedRacePicks = completedTop10 + completedRaceSpecials + completedTeamPicks;
  const notice = getStatusNotice(status);
  const shareScope = normalizePredictionShareScope(status.shareScope);
  const shareSlug = status.share?.trim() || null;
  const sharePreview = shareSlug ? await getPublicPredictionShareBySlug(shareSlug, shareScope) : null;
  const shareVersion = Number(status.v ?? sharePreview?.shareImageVersion ?? current?.shareImageVersion ?? 1) || 1;
  const shareUrls = sharePreview ? buildPredictionShareUrls(sharePreview.shareSlug, shareScope, shareVersion) : null;

  return (
    <AppShell>
      <section className="grid gap-4 py-6 sm:gap-5">
        <FantasyHero activeTab={activeTab} predictionState={predictionState} />

        {notice ? <StatusNotice notice={notice} /> : null}

        {activeTab === "picks" ? (
          <PredictionModule
            completedQualificationPicks={completedQualificationPicks}
            completedRacePicks={completedRacePicks}
            fields={picks}
            predictionState={predictionState}
            teamFields={teamPicks}
            userSignedIn={Boolean(user)}
          />
        ) : null}

        {activeTab === "leagues" ? (
          <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
            <LeagueActivity
              myLeagues={myLeagues}
              openLeagues={openLeagues}
              selectedLeagueId={status.league}
              userSignedIn={Boolean(user)}
            />
            <aside className="min-w-0">
              <LeagueControlPanel userSignedIn={Boolean(user)} />
            </aside>
          </div>
        ) : null}

        {activeTab === "leaderboard" ? (
          <GlobalFantasyLeaderboardPanel
            currentDisplayName={profileSummary?.displayName ?? null}
            leaderboard={leaderboard}
          />
        ) : null}
        {sharePreview && shareUrls ? (
          <PredictionShareModalLauncher
            publicUrl={shareUrls.publicUrl}
            raceName={sharePreview.race.name}
            scope={shareScope}
            shareImageUrl={shareUrls.shareImageUrl}
            shareSlug={sharePreview.shareSlug}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

function FantasyHero({
  activeTab,
  predictionState,
}: {
  activeTab: "picks" | "leagues" | "leaderboard";
  predictionState: PredictionState;
}) {
  const totalScore = predictionState.seasonSummary.totalScore;

  return (
    <section className="stitch-panel relative overflow-hidden p-0">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgb(225_6_0_/_0.22),transparent_24rem),linear-gradient(135deg,rgb(255_255_255_/_0.06),transparent_40%)]"
      />
      <div className="relative flex flex-col justify-between gap-6 p-5 sm:p-6 xl:flex-row xl:items-end">
        <div className="min-w-0">
          <p className="font-telemetry flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
            <Trophy aria-hidden="true" className="size-3.5" />
            Фэнтези-лига
          </p>
          <h1 className="mt-2 max-w-3xl text-balance font-display text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-4xl">
            {predictionState.race?.name ?? "Следующий этап"}
          </h1>
          <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-muted-foreground">
            Собери прогноз, соревнуйся с друзьями и сравнивай очки после финиша.
            {predictionState.race ? ` Старт гонки: ${predictionState.race.startsAt}.` : ""}
          </p>
        </div>
        <div className="grid w-full shrink-0 grid-cols-3 gap-2 xl:w-auto">
          <HeroStat label="Очки сезона" value={totalScore === null || totalScore === undefined ? "—" : String(totalScore)} />
          <HeroStat label="Прогнозов" value={String(predictionState.seasonSummary.predictionCount)} />
          <PreviousPredictionResultButton
            className="stitch-panel h-full min-h-[4.25rem] w-full min-w-0 whitespace-normal border border-border/70 bg-secondary/25 px-3 py-2.5 text-center text-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-primary xl:min-w-[7.5rem]"
            previousResult={predictionState.previousResult}
          />
        </div>
      </div>
      <nav
        aria-label="Разделы фэнтези-лиги"
        className="relative grid grid-cols-3 gap-1 border-t stitch-divider bg-background/30 p-1.5"
      >
        <FantasyTab active={activeTab === "picks"} href="/fantasy?tab=picks" icon={ClipboardList} label="Прогноз" />
        <FantasyTab active={activeTab === "leagues"} href="/fantasy?tab=leagues" icon={Users} label="Лиги" />
        <FantasyTab active={activeTab === "leaderboard"} href="/fantasy?tab=leaderboard" icon={ListOrdered} label="Лидерборд" />
      </nav>
    </section>
  );
}

function FantasyTab({
  active,
  href,
  icon: Icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: typeof ClipboardList;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 font-display text-sm font-bold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      href={href}
      prefetch={false}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label}</span>
    </Link>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stitch-panel grid min-w-0 content-center gap-1.5 border border-border/70 bg-secondary/25 px-3 py-2.5 text-center">
      <p className="font-telemetry text-xl font-extrabold leading-none">{value}</p>
      <p className="stitch-label text-[0.55rem] text-muted-foreground">{label}</p>
    </div>
  );
}

function PredictionModule({
  completedQualificationPicks,
  completedRacePicks,
  fields,
  predictionState,
  teamFields,
  userSignedIn,
}: {
  completedQualificationPicks: number;
  completedRacePicks: number;
  fields: PredictionField[];
  predictionState: PredictionState;
  teamFields: TeamPredictionField[];
  userSignedIn: boolean;
}) {
  return (
    <section className="stitch-panel overflow-hidden p-0" id="fantasy-picks">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40">
            <ClipboardList aria-hidden="true" className="size-4.5 text-primary" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold leading-tight">Фэнтези-пики</h2>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
              {predictionState.race
                ? `Два дедлайна: квалификация и старт гонки`
                : "Расписание появится после синхронизации"}
            </p>
          </div>
        </div>
        <FantasyScoringDialog className="shrink-0" />
      </div>

      {predictionState.race && predictionState.drivers.length ? (
        <div className="grid gap-4 p-4 sm:gap-5 sm:p-5">
          <form
            action={saveFantasyPrediction}
            className="rounded-lg border border-border/80 bg-background/25 p-4 sm:p-5"
          >
            <input name="raceId" type="hidden" value={predictionState.race.id} />
            <input name="predictionScope" type="hidden" value="qualification" />
            <SectionHeader
              badge={
                <PickProgressBadge
                  completed={completedQualificationPicks}
                  saved={completedQualificationPicks > 0}
                  total={1}
                />
              }
              countdown={
                <FantasyLockCountdown
                  locked={Boolean(predictionState.race.poleLocked)}
                  lockedLabel="Закрыто"
                  prefix="До квалификации"
                  startsAtIso={predictionState.race.qualifyingStartsAtIso}
                />
              }
              description="Заполняй и вноси правки до старта квалификации."
              eyebrow="Квалификация"
              icon={Timer}
              title="Прогноз на стартовую решетку"
            />
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-end">
              <PredictionPickCard drivers={predictionState.drivers} field={fields[0]} />
              <PredictionSaveButton
                locked={Boolean(predictionState.race.poleLocked)}
                lockedLabel="Поул закрыт"
                saveLabel="Сохранить поул"
                userSignedIn={userSignedIn}
              />
            </div>
          </form>

          <form
            action={saveFantasyPrediction}
            className="rounded-lg border border-border/80 bg-muted/15 p-4 sm:p-5"
          >
            <input name="raceId" type="hidden" value={predictionState.race.id} />
            <input name="predictionScope" type="hidden" value="race" />
            <SectionHeader
              badge={
                <PickProgressBadge
                  completed={completedRacePicks}
                  saved={completedRacePicks > 0}
                  total={14}
                />
              }
              countdown={
                <FantasyLockCountdown
                  locked={Boolean(predictionState.race.raceLocked)}
                  lockedLabel="Закрыто"
                  prefix="До гонки"
                  startsAtIso={predictionState.race.raceStartsAtIso}
                />
              }
              description="Спецпики и топ-10 можно править до старта гонки."
              eyebrow="Гонка"
              icon={Flag}
              title="Гоночный прогноз"
            />
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary/50">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.round((completedRacePicks / 14) * 100)}%` }}
              />
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="grid content-start gap-3">
                {fields.slice(1).map((field) => (
                  <PredictionPickCard
                    drivers={predictionState.drivers}
                    field={field}
                    key={field.name}
                  />
                ))}
                {teamFields.map((field) => (
                  <TeamPredictionPickCard
                    field={field}
                    key={field.name}
                    teams={predictionState.teams}
                  />
                ))}
              </div>
              <div className="rounded-lg border border-border/80 bg-background/30 p-4">
                <div className="mb-4 grid gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-primary">
                      Топ-10 · гонка
                    </p>
                    <Badge className="shrink-0" variant={predictionState.race.raceLocked ? "warning" : "secondary"}>
                      {predictionState.race.raceLocked
                        ? "Закрыто"
                        : `${predictionState.current?.top10DriverIds?.length ?? 0}/10`}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-muted-foreground">
                      Расставь десять пилотов в порядке финиша.
                    </p>
                    <QualifyingResultsButton qualifyingResults={predictionState.qualifyingResults} />
                  </div>
                </div>
                <Top10PredictionPicker
                  defaultValue={predictionState.current?.top10DriverIds ?? []}
                  drivers={predictionState.drivers}
                  locked={predictionState.race.raceLocked}
                />
              </div>
            </div>
            <div className="mt-4">
              <PredictionSaveButton
                locked={Boolean(predictionState.race.raceLocked)}
                lockedLabel="Прогноз на гонку закрыт"
                saveLabel="Сохранить прогноз на гонку"
                userSignedIn={userSignedIn}
              />
            </div>
          </form>
        </div>
      ) : (
        <p className="m-4 rounded-md border border-border/70 bg-background/35 p-4 text-sm leading-6 text-muted-foreground sm:m-5">
          Прогноз откроется, когда RaceMate подтянет гонку и список пилотов.
        </p>
      )}
    </section>
  );
}

function SectionHeader({
  badge,
  countdown,
  description,
  eyebrow,
  icon: Icon,
  title,
}: {
  badge: React.ReactNode;
  countdown: React.ReactNode;
  description: string;
  eyebrow: string;
  icon: typeof Timer;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-telemetry flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-primary">
          <Icon aria-hidden="true" className="size-3.5" />
          {eyebrow}
        </p>
        <h3 className="mt-1.5 font-display text-xl font-bold leading-tight">{title}</h3>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">{description}</p>
      </div>
      <div className="grid justify-items-end gap-2">
        {countdown}
        {badge}
      </div>
    </div>
  );
}

function PickProgressBadge({
  completed,
  saved,
  total,
}: {
  completed: number;
  saved: boolean;
  total: number;
}) {
  return (
    <Badge variant={saved ? "success" : "secondary"}>
      Выборов {completed}/{total}
    </Badge>
  );
}

function PredictionSaveButton({
  locked,
  lockedLabel,
  saveLabel,
  userSignedIn,
}: {
  locked: boolean;
  lockedLabel: string;
  saveLabel: string;
  userSignedIn: boolean;
}) {
  if (!userSignedIn) {
    return (
      <Button asChild className="h-12 w-full">
        <Link href="/auth">Войти, чтобы сохранить</Link>
      </Button>
    );
  }

  return (
    <Button className="h-12 w-full" disabled={locked} type="submit">
      <Lock aria-hidden="true" data-icon="inline-start" />
      {locked ? lockedLabel : saveLabel}
    </Button>
  );
}

function PredictionPickCard({
  drivers,
  field,
}: {
  drivers: DriverOption[];
  field: PredictionField;
}) {
  const selectedDriver = drivers.find((driver) => driver.id === field.value);
  const team = getTeamAsset(selectedDriver?.team);
  const displayValue = field.allowNoDnf && field.value === "__none"
    ? "Без DNF"
    : selectedDriver
      ? selectedDriver.name
      : field.helper;

  return (
    <label
      className={cn(
        "group grid gap-2.5 rounded-lg border border-border/80 bg-background/30 p-3.5 transition-colors hover:border-primary/50 hover:bg-accent/50",
        field.locked && "border-warning/50 bg-warning/5",
      )}
      htmlFor={field.name}
    >
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="h-9 w-1.5 shrink-0 rounded-full bg-primary/70"
          style={{ backgroundColor: team?.color ?? undefined }}
        />
        <span className="min-w-0 flex-1">
          <span className="stitch-label block text-[0.56rem] text-muted-foreground">{field.short}</span>
          <span
            className={cn(
              "mt-1 block truncate text-sm font-bold",
              !selectedDriver && !(field.allowNoDnf && field.value === "__none") && "text-muted-foreground",
            )}
          >
            {displayValue}
          </span>
        </span>
        {field.locked ? (
          <Lock aria-hidden="true" className="size-4 shrink-0 text-warning" />
        ) : (
          <Edit3
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
          />
        )}
      </span>
      <span className="text-xs font-semibold text-muted-foreground">
        {field.locked ? `${field.label} уже заблокирован` : field.label}
      </span>
      <select
        className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        defaultValue={field.value ?? ""}
        disabled={field.locked}
        id={field.name}
        name={field.name}
      >
        <option value="">Пилот</option>
        {field.allowNoDnf ? <option value="__none">Без DNF</option> : null}
        {drivers.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {driver.name} · {driver.team}
          </option>
        ))}
      </select>
    </label>
  );
}

function TeamPredictionPickCard({
  field,
  teams,
}: {
  field: TeamPredictionField;
  teams: TeamOption[];
}) {
  const selectedTeam = teams.find((team) => team.id === field.value);
  const team = getTeamAsset(selectedTeam?.name ?? selectedTeam?.code);
  const displayValue = selectedTeam?.name ?? field.helper;

  return (
    <label
      className={cn(
        "group grid gap-2.5 rounded-lg border border-border/80 bg-background/30 p-3.5 transition-colors hover:border-primary/50 hover:bg-accent/50",
        field.locked && "border-warning/50 bg-warning/5",
      )}
      htmlFor={field.name}
    >
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="h-9 w-1.5 shrink-0 rounded-full bg-primary/70"
          style={{ backgroundColor: team?.color ?? undefined }}
        />
        <span className="min-w-0 flex-1">
          <span className="stitch-label block text-[0.56rem] text-muted-foreground">{field.short}</span>
          <span className={cn("mt-1 block truncate text-sm font-bold", !selectedTeam && "text-muted-foreground")}>
            {displayValue}
          </span>
        </span>
        {field.locked ? (
          <Lock aria-hidden="true" className="size-4 shrink-0 text-warning" />
        ) : (
          <Edit3
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
          />
        )}
      </span>
      <span className="text-xs font-semibold text-muted-foreground">
        {field.locked ? `${field.label} уже заблокирована` : field.label}
      </span>
      <select
        className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        defaultValue={field.value ?? ""}
        disabled={field.locked}
        id={field.name}
        name={field.name}
      >
        <option value="">Команда</option>
        {teams.map((teamOption) => (
          <option key={teamOption.id} value={teamOption.id}>
            {teamOption.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function LeagueControlPanel({ userSignedIn }: { userSignedIn: boolean }) {
  return (
    <section className="stitch-panel overflow-hidden p-0">
      <div className="flex items-start gap-3 border-b stitch-divider p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40">
          <Users aria-hidden="true" className="size-4.5 text-primary" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-tight">Моя лига</h2>
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
            Создай комнату или войди по коду друзей
          </p>
        </div>
      </div>
      <div className="grid gap-5 p-4 sm:p-5">
        <form action={createFantasyLeague} className="grid gap-3">
          <label className="grid gap-2 text-sm font-semibold" htmlFor="name">
            Название лиги
            <input
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              id="name"
              name="name"
              placeholder="Поздний пит-стоп"
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input className="size-4 accent-primary" name="isPublic" type="checkbox" />
            Показывать в общем списке
          </label>
          <Button disabled={!userSignedIn} type="submit">
            <Plus aria-hidden="true" data-icon="inline-start" />
            {userSignedIn ? "Создать лигу" : "Войти, чтобы создать"}
          </Button>
        </form>

        <form action={joinFantasyLeague} className="grid gap-3 border-t stitch-divider pt-5">
          <label className="grid gap-2 text-sm font-semibold" htmlFor="inviteCode">
            Код приглашения
            <input
              className="min-h-11 rounded-md border border-input bg-background px-3 font-mono text-sm uppercase outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              id="inviteCode"
              name="inviteCode"
              placeholder="RACE24"
              required
            />
          </label>
          <Button disabled={!userSignedIn} type="submit" variant="secondary">
            <KeyRound aria-hidden="true" data-icon="inline-start" />
            {userSignedIn ? "Войти по коду" : "Войти, чтобы вступить"}
          </Button>
        </form>
      </div>
    </section>
  );
}

function LeagueActivity({
  myLeagues,
  openLeagues,
  selectedLeagueId,
  userSignedIn,
}: {
  myLeagues: LeagueSummary[];
  openLeagues: LeagueSummary[];
  selectedLeagueId?: string;
  userSignedIn: boolean;
}) {
  return (
    <section className="grid gap-4 sm:gap-5">
      <LeagueList
        emptyText="Ты пока не состоишь в лигах. Создай свою или войди по коду друзей."
        leagues={myLeagues}
        selectedLeagueId={selectedLeagueId}
        title="Мои лиги"
      />
      <LeagueList
        emptyText="Открытых лиг пока нет. Публичные лиги появятся здесь после создания."
        leagues={openLeagues}
        selectedLeagueId={selectedLeagueId}
        showJoinAction
        title="Открытые лиги"
        userSignedIn={userSignedIn}
      />
    </section>
  );
}

function LeagueList({
  emptyText,
  leagues,
  selectedLeagueId,
  showJoinAction = false,
  title,
  userSignedIn = true,
}: {
  emptyText: string;
  leagues: LeagueSummary[];
  selectedLeagueId?: string;
  showJoinAction?: boolean;
  title: string;
  userSignedIn?: boolean;
}) {
  return (
    <div className="stitch-panel overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40">
            <Users aria-hidden="true" className="size-4.5 text-primary" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Паддок друзей</p>
          </div>
        </div>
        <Badge variant="secondary">{leagues.length}</Badge>
      </div>
      <div className="divide-y stitch-divider">
        {leagues.length ? (
          leagues.map((league) => {
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40 font-display text-sm font-extrabold text-primary"
                >
                  {getLeagueInitials(league.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-display text-base font-bold">{league.name}</span>
                    {league.isOwner ? (
                      <Badge variant="outline">
                        <Crown aria-hidden="true" className="mr-1 size-3" />
                        Создатель
                      </Badge>
                    ) : null}
                    {league.isMember && !league.isOwner ? <Badge variant="outline">Ты здесь</Badge> : null}
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold text-muted-foreground">
                    {league.members} {pluralize(league.members, ["участник", "участника", "участников"])} · лидер —{" "}
                    {league.leader}
                  </span>
                </span>
                <span className="grid shrink-0 justify-items-end gap-1 text-right">
                  <span className="font-telemetry text-lg font-extrabold leading-none">{league.score}</span>
                  <span className="text-[0.62rem] font-semibold text-muted-foreground">очки лидера</span>
                </span>
                {showJoinAction ? (
                  <form action={joinFantasyLeague} className="shrink-0">
                    <input name="inviteCode" type="hidden" value={league.inviteCode ?? ""} />
                    <Button disabled={!userSignedIn || !league.inviteCode} size="sm" type="submit" variant="secondary">
                      {userSignedIn ? "Присоединиться" : "Войти"}
                    </Button>
                  </form>
                ) : (
                  <span className="font-telemetry shrink-0 rounded border border-border/70 bg-secondary/40 px-2 py-1 text-[0.68rem] font-extrabold uppercase">
                    {league.inviteCode ?? "Закрытая"}
                  </span>
                )}
              </>
            );
            const rowClassName = cn(
              "flex flex-wrap items-center gap-3 p-4",
              selectedLeagueId === league.id && "bg-accent/60",
            );

            return showJoinAction ? (
              <div className={rowClassName} key={league.id ?? league.name}>
                {content}
              </div>
            ) : (
              <Link
                className={cn(
                  rowClassName,
                  "transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                href={league.id ? `/fantasy/leagues/${league.id}` : "/fantasy?tab=leagues"}
                key={league.id ?? league.name}
                prefetch={false}
              >
                {content}
              </Link>
            );
          })
        ) : (
          <p className="p-5 text-sm leading-6 text-muted-foreground">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function StatusNotice({
  notice,
}: {
  notice: {
    icon: typeof CheckCircle2;
    text: string;
    tone: "success" | "warning";
  };
}) {
  return (
    <div
      className={cn(
        "stitch-panel flex items-center gap-3 p-4 text-sm",
        notice.tone === "success" && "border-success/40 bg-success/10",
        notice.tone === "warning" && "border-warning/40 bg-warning/10",
      )}
    >
      <notice.icon
        aria-hidden="true"
        className={cn(
          "size-5 shrink-0",
          notice.tone === "success" ? "text-success" : "text-warning",
        )}
      />
      <span className="leading-6 text-muted-foreground">{notice.text}</span>
    </div>
  );
}

function buildPredictionFields(
  current: PredictionState["current"],
  race?: PredictionState["race"],
): PredictionField[] {
  return [
    {
      helper: "Прогноз на квалификацию",
      label: "Поул-позиция (квалификация)",
      name: "poleDriverId",
      short: "Поул · квалификация",
      locked: race?.poleLocked,
      value: current?.poleDriverId,
    },
    {
      helper: "Выбери пилота",
      label: "Лучший круг",
      name: "fastestLapDriverId",
      short: "Fastest lap",
      locked: race?.raceLocked,
      value: current?.fastestLapDriverId,
    },
    {
      allowNoDnf: true,
      helper: "Выбери пилота",
      label: "Первый сход",
      name: "dnfDriverId",
      short: "DNF",
      locked: race?.raceLocked,
      value: current?.dnfPickKind === "none" ? "__none" : current?.dnfDriverId,
    },
  ];
}

function buildTeamPredictionFields(
  current: PredictionState["current"],
  race?: PredictionState["race"],
): TeamPredictionField[] {
  return [
    {
      helper: "Выбери команду",
      label: "Команда, которая наберет больше всего очков за этап",
      name: "topScoringTeamId",
      short: "Top team",
      locked: race?.raceLocked,
      value: current?.topScoringTeamId,
    },
    {
      helper: "Выбери команду",
      label: "Команда с самым быстрым пит-стопом",
      name: "fastestPitStopTeamId",
      short: "Pit stop",
      locked: race?.raceLocked,
      value: current?.fastestPitStopTeamId,
    },
  ];
}

function getLeagueInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "Л"
  );
}

function pluralize(value: number, forms: [string, string, string]) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return forms[0];
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1];
  }

  return forms[2];
}

function getStatusNotice(status: FantasySearchParams) {
  if (status.saved) {
    return {
      icon: CheckCircle2,
      text: "Прогноз сохранен. Его можно поправить до блокировки.",
      tone: "success" as const,
    };
  }

  if (status.created) {
    return {
      icon: CheckCircle2,
      text: "Лига создана. Код приглашения уже доступен в списке.",
      tone: "success" as const,
    };
  }

  if (status.joined) {
    return {
      icon: CheckCircle2,
      text: "Ты в лиге. После гонки очки появятся в таблице.",
      tone: "success" as const,
    };
  }

  if (status.deleted) {
    return {
      icon: CheckCircle2,
      text: "Лига удалена.",
      tone: "success" as const,
    };
  }

  if (status.left) {
    return {
      icon: CheckCircle2,
      text: "Ты вышел из лиги. Личные прогнозы остались на месте.",
      tone: "success" as const,
    };
  }

  if (status.message === "top10") {
    return {
      icon: ClipboardList,
      text: "Один пилот не может занимать несколько мест в топ-10.",
      tone: "warning" as const,
    };
  }

  if (status.message === "driver") {
    return {
      icon: ClipboardList,
      text: "Один из выбранных пилотов уже недоступен. Обнови прогноз и сохрани снова.",
      tone: "warning" as const,
    };
  }

  if (status.message === "locked") {
    return {
      icon: Lock,
      text: "Гонка уже началась, новый прогноз принять нельзя.",
      tone: "warning" as const,
    };
  }

  if (status.message) {
    return {
      icon: ClipboardList,
      text: "Не получилось выполнить действие. Проверь данные и попробуй еще раз.",
      tone: "warning" as const,
    };
  }

  return null;
}
