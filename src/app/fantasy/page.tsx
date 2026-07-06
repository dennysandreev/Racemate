import {
  CheckCircle2,
  ClipboardList,
  Edit3,
  Lock,
  Plus,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";

import {
  createFantasyLeague,
  joinFantasyLeague,
  saveFantasyPrediction,
} from "@/app/fantasy/actions";
import { PredictionShareModalLauncher } from "@/components/fantasy/PredictionShareModal";
import { AppShell } from "@/components/racemate/app-shell";
import { DataRow } from "@/components/racemate/data-row";
import { FantasyScoringDialog } from "@/components/racemate/fantasy-scoring-dialog";
import {
  PreviousPredictionResultButton,
  QualifyingResultsButton,
} from "@/components/racemate/fantasy-prediction-tools";
import { GlobalFantasyLeaderboardPanel } from "@/components/racemate/global-fantasy-leaderboard";
import {
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
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
import { getSessionUser } from "@/lib/auth";
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
  const [predictionState, leagues, leaderboard] = await Promise.all([
    getPredictionState(user?.id),
    getLeagues(user?.id),
    getGlobalFantasyLeaderboard(),
  ]);
  const myLeagues = leagues.filter((league) => league.isMember || league.isOwner);
  const openLeagues = leagues.filter((league) => !league.isMember && !league.isOwner);
  const current = predictionState.current;
  const picks = buildPredictionFields(current, predictionState.race);
  const teamPicks = buildTeamPredictionFields(current, predictionState.race);
  const completedTop10 = current?.top10DriverIds?.length ?? 0;
  const completedSpecials = picks.filter((pick) =>
    pick.name === "dnfDriverId" && current?.dnfPickKind === "none"
      ? true
      : Boolean(pick.value),
  ).length;
  const completedTeamPicks = teamPicks.filter((pick) => Boolean(pick.value)).length;
  const completedPicks = completedTop10 + completedSpecials + completedTeamPicks;
  const totalPicks = 15;
  const notice = getStatusNotice(status);
  const shareScope = normalizePredictionShareScope(status.shareScope);
  const shareSlug = status.share?.trim() || null;
  const sharePreview = shareSlug ? await getPublicPredictionShareBySlug(shareSlug, shareScope) : null;
  const shareVersion = Number(status.v ?? sharePreview?.shareImageVersion ?? current?.shareImageVersion ?? 1) || 1;
  const shareUrls = sharePreview ? buildPredictionShareUrls(sharePreview.shareSlug, shareScope, shareVersion) : null;

  return (
    <AppShell>
      <section className="grid gap-6 py-6">
        <FantasyEventHeader
          leagues={myLeagues}
          predictionState={predictionState}
        />

        <FantasyTabs activeTab={activeTab} />

        {notice ? <StatusNotice notice={notice} /> : null}

        {activeTab === "picks" ? (
          <div className="grid min-w-0 gap-6">
            <PredictionModule
              completedPicks={completedPicks}
              fields={picks}
              predictionState={predictionState}
              saved={Boolean(status.saved)}
              teamFields={teamPicks}
              totalPicks={totalPicks}
              userSignedIn={Boolean(user)}
            />
          </div>
        ) : null}

        {activeTab === "leagues" ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
            <LeagueActivity
              myLeagues={myLeagues}
              openLeagues={openLeagues}
              selectedLeagueId={status.league}
            />
            <aside className="min-w-0">
            <LeagueControlPanel userSignedIn={Boolean(user)} />
            </aside>
          </div>
        ) : null}

        {activeTab === "leaderboard" ? <GlobalFantasyLeaderboardPanel leaderboard={leaderboard} /> : null}
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

function FantasyEventHeader({
  leagues,
  predictionState,
}: {
  leagues: LeagueSummary[];
  predictionState: PredictionState;
}) {
  const score = predictionState.current?.score;
  const hasPrediction = Boolean(predictionState.current);

  return (
    <section className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
      <div className="min-w-0">
        <span className="font-telemetry mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-primary">
          Фентази лига
        </span>
        <h1 className="font-display max-w-4xl text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
          {predictionState.race?.name ?? "Следующий этап"}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          Собери прогноз, соревнуйся в лиге с друзьями и сравнивай очки после финиша.
        </p>
      </div>

      <div className="grid w-full max-w-xl gap-3 xl:w-[30rem]">
        <div className="grid grid-cols-3 gap-3">
          <FantasyCounter className={hasPrediction ? "border-success bg-success/10" : "border-warning bg-warning/10"} label="Прогноз" value={hasPrediction ? "Готов" : "Не сделан"} />
          <FantasyCounter label="Лиги" value={String(leagues.length)} />
          <FantasyCounter
            label="Очки"
            value={score === null || score === undefined ? "—" : String(score)}
          />
        </div>
      </div>
    </section>
  );
}

function FantasyTabs({ activeTab }: { activeTab: "picks" | "leagues" | "leaderboard" }) {
  const tabs = [
    { href: "/fantasy?tab=picks", label: "Прогноз", value: "picks" },
    { href: "/fantasy?tab=leagues", label: "Лиги", value: "leagues" },
    { href: "/fantasy?tab=leaderboard", label: "Лидерборд", value: "leaderboard" },
  ] as const;

  return (
    <nav className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-card/60 p-1" aria-label="Разделы фентази-лиги">
      {tabs.map((tab) => (
        <Link
          className={cn(
            "rounded-md px-3 py-2.5 text-center font-telemetry text-xs font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeTab === tab.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          href={tab.href}
          key={tab.value}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function FantasyCounter({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "stitch-panel grid min-w-0 gap-2 border-b-2 border-primary px-4 py-3 text-center sm:min-w-[7.5rem]",
        className,
      )}
    >
      <p className="font-telemetry text-lg font-bold leading-none">{value}</p>
      <p className="font-telemetry text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function PredictionModule({
  completedPicks,
  fields,
  predictionState,
  saved,
  teamFields,
  totalPicks,
  userSignedIn,
}: {
  completedPicks: number;
  fields: PredictionField[];
  predictionState: PredictionState;
  saved: boolean;
  teamFields: TeamPredictionField[];
  totalPicks: number;
  userSignedIn: boolean;
}) {
  const score = predictionState.current?.score;

  return (
    <section className="stitch-panel relative overflow-hidden p-5 sm:p-8" id="fantasy-picks">
      <Trophy
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-5 size-28 text-primary opacity-10"
      />
      <div className="relative z-10 mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold uppercase">Фентази-пики</h2>
          <p className="mt-2 font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {predictionState.race
              ? `Старт: ${predictionState.race.startsAt}`
              : "Расписание появится после синхронизации"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{completedPicks}/{totalPicks} выборов</Badge>
          <PreviousPredictionResultButton previousResult={predictionState.previousResult} />
          <FantasyScoringDialog className="shrink-0" />
          <Badge variant={saved ? "success" : userSignedIn ? "danger" : "warning"}>
            {saved ? "Сохранено" : userSignedIn ? `${score ?? 0} очков` : "Нужен вход"}
          </Badge>
        </div>
      </div>

      {predictionState.race && predictionState.drivers.length ? (
        <div className="relative z-10 grid gap-5">
          <form action={saveFantasyPrediction} className="rounded-lg border border-border bg-background/25 p-4 sm:p-5">
            <input name="raceId" type="hidden" value={predictionState.race.id} />
            <input name="predictionScope" type="hidden" value="qualification" />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-primary">Квалификация</p>
                <h3 className="mt-2 font-display text-xl font-bold">Прогноз на стартовую решетку</h3>
                <p className="mt-1 text-sm text-muted-foreground">Заполняй и вноси правки до старта квалификации.</p>
              </div>
              <Badge variant={predictionState.race.poleLocked ? "warning" : "secondary"}>
                {predictionState.race.poleLocked ? "Закрыто" : "До квалификации"}
              </Badge>
            </div>
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

          <form action={saveFantasyPrediction} className="rounded-lg border border-border bg-muted/20 p-4 sm:p-5">
            <input name="raceId" type="hidden" value={predictionState.race.id} />
            <input name="predictionScope" type="hidden" value="race" />
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-primary">Гонка</p>
                <h3 className="mt-2 font-display text-xl font-bold">Гоночный прогноз</h3>
                <p className="mt-1 text-sm text-muted-foreground">Заполняй и вноси правки до старта гонки.</p>
              </div>
              <Badge variant={predictionState.race.raceLocked ? "warning" : "secondary"}>
                {predictionState.race.raceLocked ? "Закрыто" : "До старта гонки"}
              </Badge>
            </div>
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="grid content-start gap-4">
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
              <div className="rounded-lg border border-border bg-background/35 p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">Топ-10 · гонка</p>
                    <p className="mt-2 text-sm text-muted-foreground">Расставь десять пилотов в предполагаемом порядке финиша.</p>
                  </div>
                  <Badge variant={predictionState.race.raceLocked ? "warning" : "secondary"}>
                    {predictionState.race.raceLocked ? "Закрыто" : `${predictionState.current?.top10DriverIds?.length ?? 0}/10`}
                  </Badge>
                </div>
                <div className="mb-4 flex flex-wrap justify-end gap-2">
                  <QualifyingResultsButton qualifyingResults={predictionState.qualifyingResults} />
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
        <p className="relative z-10 rounded-md border border-border/70 bg-background/35 p-4 text-sm leading-6 text-muted-foreground">
          Прогноз откроется, когда RaceMate подтянет гонку и список пилотов.
        </p>
      )}
    </section>
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
        "group grid gap-3 rounded-lg border border-border bg-muted/35 p-4 transition-colors hover:border-primary/60 hover:bg-accent/70",
        field.locked && "border-warning/50 bg-warning/5",
      )}
      htmlFor={field.name}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {field.short}
          </span>
          <span className="mt-2 flex min-w-0 items-center gap-2 font-telemetry text-sm font-bold uppercase text-foreground">
            <span
              aria-hidden="true"
              className="h-8 w-1 rounded-full bg-primary"
              style={{ backgroundColor: team?.color ?? undefined }}
            />
            <span className="min-w-0 truncate">{displayValue}</span>
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
        <option value="">Пока без выбора</option>
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
        "group grid gap-3 rounded-lg border border-border bg-muted/35 p-4 transition-colors hover:border-primary/60 hover:bg-accent/70",
        field.locked && "border-warning/50 bg-warning/5",
      )}
      htmlFor={field.name}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {field.short}
          </span>
          <span className="mt-2 flex min-w-0 items-center gap-2 font-telemetry text-sm font-bold uppercase text-foreground">
            <span
              aria-hidden="true"
              className="h-8 w-1 rounded-full bg-primary"
              style={{ backgroundColor: team?.color ?? undefined }}
            />
            <span className="min-w-0 truncate">{displayValue}</span>
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
        <option value="">Пока без выбора</option>
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
    <StitchPanel>
      <StitchPanelHeader
        icon={Users}
        meta="Создай комнату или войди по коду друзей."
        title="Моя лига"
      />
      <div className="grid gap-5 p-5">
        <form action={createFantasyLeague} className="grid gap-3">
          <label className="grid gap-2 text-sm font-medium" htmlFor="name">
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
          <label className="grid gap-2 text-sm font-medium" htmlFor="inviteCode">
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
            {userSignedIn ? "Войти по коду" : "Войти, чтобы вступить"}
          </Button>
        </form>
      </div>
    </StitchPanel>
  );
}

function LeagueActivity({
  myLeagues,
  openLeagues,
  selectedLeagueId,
}: {
  myLeagues: LeagueSummary[];
  openLeagues: LeagueSummary[];
  selectedLeagueId?: string;
}) {
  return (
    <section className="grid gap-5">
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
        title="Открытые лиги"
      />
    </section>
  );
}

function LeagueList({
  emptyText,
  leagues,
  selectedLeagueId,
  title,
}: {
  emptyText: string;
  leagues: LeagueSummary[];
  selectedLeagueId?: string;
  title: string;
}) {
  return (
    <div className="stitch-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4 sm:p-5">
        <div>
          <p className="stitch-label text-muted-foreground">Паддок друзей</p>
          <h2 className="mt-2 font-display text-2xl font-bold">{title}</h2>
        </div>
        <Badge variant="secondary">{leagues.length} лиг</Badge>
      </div>
      <div className="divide-y stitch-divider">
        {leagues.length ? (
          leagues.map((league) => (
            <Link
              className={cn(
                "grid gap-3 p-4 transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                selectedLeagueId === league.id && "bg-accent/60",
              )}
              href={league.id ? `/fantasy/leagues/${league.id}` : "/fantasy?tab=leagues"}
              key={league.id ?? league.name}
              prefetch={false}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="truncate font-display text-lg font-bold">{league.name}</h3>
                  {league.isOwner ? <Badge variant="outline">Создатель</Badge> : null}
                  {league.isMember && !league.isOwner ? <Badge variant="outline">Ты здесь</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {league.members} участников, лидер — {league.leader}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <DataRow label="Очки лидера" value={String(league.score)} />
                <DataRow label="Код" value={league.inviteCode ?? "Закрытая"} />
              </div>
            </Link>
          ))
        ) : (
          <p className="p-5 text-sm leading-6 text-muted-foreground">
            {emptyText}
          </p>
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

  if (status.message === "top10") {
    return {
      icon: ClipboardList,
      text: "Заполни все 10 мест топ-10 без повторов.",
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
