import {
  CheckCircle2,
  ClipboardList,
  Edit3,
  Lock,
  Plus,
  Radio,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";

import {
  createFantasyLeague,
  joinFantasyLeague,
  saveFantasyPrediction,
} from "@/app/fantasy/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { DataRow } from "@/components/racemate/data-row";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getDriverStandings,
  getLeagues,
  getNewsItems,
  getPolls,
  getPredictionState,
} from "@/data/racemate-repository";
import { getTeamAsset } from "@/data/f1-assets";
import { getSessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type {
  DriverOption,
  LeagueSummary,
  NewsItem,
  PollSummary,
  PredictionState,
  StandingRow,
} from "@/types/racemate";

type FantasySearchParams = {
  created?: string;
  joined?: string;
  message?: string;
  saved?: string;
};

type PredictionField = {
  helper: string;
  label: string;
  name: "winnerDriverId" | "poleDriverId" | "fastestLapDriverId" | "dnfDriverId";
  short: string;
  value?: string | null;
};

export default async function FantasyPage({
  searchParams,
}: {
  searchParams: Promise<FantasySearchParams>;
}) {
  const [status, user] = await Promise.all([searchParams, getSessionUser()]);
  const [predictionState, leagues, standings, news, polls] = await Promise.all([
    getPredictionState(user?.id),
    getLeagues(),
    getDriverStandings(),
    getNewsItems({ pageSize: 2 }),
    getPolls(),
  ]);
  const current = predictionState.current;
  const picks = buildPredictionFields(current);
  const completedPicks = picks.filter((pick) => Boolean(pick.value)).length;
  const progress = Math.round((completedPicks / picks.length) * 100);
  const notice = getStatusNotice(status);

  return (
    <AppShell>
      <section className="grid gap-6 py-6">
        <FantasyEventHeader
          completedPicks={completedPicks}
          leagues={leagues}
          predictionState={predictionState}
          progress={progress}
        />

        {notice ? <StatusNotice notice={notice} /> : null}

        <div className="grid gap-6 xl:grid-cols-12 xl:items-start">
          <div className="grid min-w-0 gap-6 xl:col-span-8">
            <PredictionModule
              fields={picks}
              predictionState={predictionState}
              saved={Boolean(status.saved)}
              userSignedIn={Boolean(user)}
            />
            <FantasyNewsGrid items={news.items} />
            <LeagueActivity leagues={leagues} />
          </div>

          <aside className="grid min-w-0 content-start gap-6 xl:col-span-4">
            <FantasyStandings standings={standings} />
            <CommunityPoll poll={polls[0]} />
            <LeagueControlPanel userSignedIn={Boolean(user)} />
            <RaceSystemCard currentScore={current?.score} progress={progress} />
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

function FantasyEventHeader({
  completedPicks,
  leagues,
  predictionState,
  progress,
}: {
  completedPicks: number;
  leagues: LeagueSummary[];
  predictionState: PredictionState;
  progress: number;
}) {
  const score = predictionState.current?.score;

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
          Собери прогноз до блокировки, вступи в лигу друзей и сравни очки после
          финиша этапа.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:flex">
        <FantasyCounter label="Выборы" value={`${completedPicks}/4`} />
        <FantasyCounter label="Готово" value={`${progress}%`} />
        <FantasyCounter label="Лиги" value={String(leagues.length)} />
        <FantasyCounter
          className="hidden sm:grid"
          label="Очки"
          value={score === null || score === undefined ? "—" : String(score)}
        />
      </div>
    </section>
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
  fields,
  predictionState,
  saved,
  userSignedIn,
}: {
  fields: PredictionField[];
  predictionState: PredictionState;
  saved: boolean;
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
        <Badge variant={saved ? "success" : userSignedIn ? "danger" : "warning"}>
          {saved
            ? "Сохранено"
            : userSignedIn
              ? `${score ?? 0} очков`
              : "Нужен вход"}
        </Badge>
      </div>

      {predictionState.race && predictionState.drivers.length ? (
        <form action={saveFantasyPrediction} className="relative z-10 grid gap-4">
          <input name="raceId" type="hidden" value={predictionState.race.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <PredictionPickCard
                drivers={predictionState.drivers}
                field={field}
                key={field.name}
              />
            ))}
          </div>
          {userSignedIn ? (
            <Button className="mt-2 h-12 w-full" type="submit">
              <Lock aria-hidden="true" data-icon="inline-start" />
              Сохранить прогноз
            </Button>
          ) : (
            <Button asChild className="mt-2 h-12 w-full">
              <Link href="/auth">Войти, чтобы сохранить</Link>
            </Button>
          )}
        </form>
      ) : (
        <p className="relative z-10 rounded-md border border-border/70 bg-background/35 p-4 text-sm leading-6 text-muted-foreground">
          Прогноз откроется, когда RaceMate подтянет гонку и список пилотов.
        </p>
      )}
    </section>
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

  return (
    <label
      className="group grid gap-3 rounded-lg border border-border bg-muted/35 p-4 transition-colors hover:border-primary/60 hover:bg-accent/70"
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
            <span className="min-w-0 truncate">
              {selectedDriver ? selectedDriver.name : field.helper}
            </span>
          </span>
        </span>
        <Edit3
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
        />
      </span>
      <span className="text-xs font-semibold text-muted-foreground">{field.label}</span>
      <select
        className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        defaultValue={field.value ?? ""}
        id={field.name}
        name={field.name}
      >
        <option value="">Пока без выбора</option>
        {drivers.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {driver.name} · {driver.team}
          </option>
        ))}
      </select>
    </label>
  );
}

function FantasyNewsGrid({ items }: { items: NewsItem[] }) {
  const visibleItems = items.slice(0, 2);

  return (
    <section className="grid gap-6 sm:grid-cols-2">
      {visibleItems.length ? (
        visibleItems.map((item) => (
          <Link
            className="group stitch-panel overflow-hidden transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/news/${item.slug}`}
            key={item.slug}
          >
            <div className="h-36 border-b stitch-divider bg-[radial-gradient(circle_at_18%_20%,rgb(225_6_0_/_0.24),transparent_12rem),linear-gradient(135deg,rgb(255_255_255_/_0.08),transparent_55%)]" />
            <div className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{item.source}</Badge>
                <span className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {item.time}
                </span>
              </div>
              <h3 className="font-display text-lg font-bold leading-tight transition-colors group-hover:text-primary">
                {item.title}
              </h3>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {item.summary}
              </p>
            </div>
          </Link>
        ))
      ) : (
        <p className="stitch-panel p-5 text-sm leading-6 text-muted-foreground sm:col-span-2">
          Пока нет свежих историй для фентази-контекста.
        </p>
      )}
    </section>
  );
}

function FantasyStandings({ standings }: { standings: StandingRow[] }) {
  return (
    <StitchPanel className="overflow-hidden">
      <div className="flex items-center justify-between border-b stitch-divider p-5">
        <h2 className="font-telemetry text-xs font-bold uppercase tracking-[0.1em]">
          Положение
        </h2>
        <Trophy aria-hidden="true" className="size-5 text-primary" />
      </div>
      <div className="divide-y stitch-divider">
        {standings.slice(0, 4).map((row) => (
          <div
            className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/50"
            key={row.driver}
          >
            <span
              aria-hidden="true"
              className="h-8 w-1 rounded-full bg-primary"
              style={{ backgroundColor: row.teamColor ?? getTeamAsset(row.team)?.color ?? undefined }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-telemetry text-sm font-bold">
                {row.position}. {row.driver}
              </p>
              <p className="mt-1 truncate font-telemetry text-[0.65rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {row.team}
              </p>
            </div>
            <p className="font-telemetry text-sm font-bold text-primary">{row.points}</p>
          </div>
        ))}
      </div>
      <Link
        className="block border-t stitch-divider bg-background/45 p-4 text-center font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-primary"
        href="/leaderboard"
      >
        Открыть чемпионат
      </Link>
    </StitchPanel>
  );
}

function CommunityPoll({ poll }: { poll?: PollSummary }) {
  const options = Array.isArray(poll?.options) ? poll.options.slice(0, 3) : [];
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { label: option, votes: 0 } : option,
  );
  const totalVotes = Math.max(
    1,
    normalizedOptions.reduce((sum, option) => sum + Number(option.votes ?? 0), 0),
  );

  return (
    <StitchPanel className="border-l-4 border-l-primary p-5">
      <h2 className="font-telemetry text-xs font-bold uppercase tracking-[0.1em]">
        Активный опрос
      </h2>
      <p className="mt-4 font-display text-xl font-bold leading-tight">
        {poll?.question ?? "Кто сильнее проведет следующий этап?"}
      </p>
      <div className="mt-5 grid gap-3">
        {normalizedOptions.length ? (
          normalizedOptions.map((option) => {
            const percent = Math.round((Number(option.votes ?? 0) / totalVotes) * 100);

            return (
              <Link
                className="relative h-12 overflow-hidden rounded-md bg-muted transition-colors hover:bg-accent"
                href="/polls"
                key={option.label}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-primary/20"
                  style={{ width: `${percent}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-between gap-3 px-4 text-sm">
                  <span className="min-w-0 truncate">{option.label}</span>
                  <span className="font-telemetry">{percent}%</span>
                </span>
              </Link>
            );
          })
        ) : (
          <Link
            className="rounded-md border border-border/70 bg-background/35 p-4 text-sm leading-6 text-muted-foreground transition-colors hover:text-foreground"
            href="/polls"
          >
            Опросы появятся ближе к старту этапа.
          </Link>
        )}
      </div>
    </StitchPanel>
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

function RaceSystemCard({
  currentScore,
  progress,
}: {
  currentScore?: number | null;
  progress: number;
}) {
  return (
    <StitchPanel className="relative border-success/30 p-5">
      <div className="absolute -top-3 left-5 border border-success/50 bg-background px-2">
        <span className="font-telemetry text-[0.62rem] font-bold uppercase tracking-[0.12em] text-success">
          Система активна
        </span>
      </div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-telemetry text-xs font-bold uppercase tracking-[0.1em]">
          Race control
        </h2>
        <Radio aria-hidden="true" className="size-5 text-success" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <StitchMetric label="Готово" tone={progress === 100 ? "live" : "warning"} value={`${progress}%`} />
        <StitchMetric
          label="Очки"
          value={currentScore === null || currentScore === undefined ? "—" : String(currentScore)}
        />
        <StitchMetric label="Статус" tone="live" value="Онлайн" />
        <StitchMetric label="Лок" tone="warning" value="До этапа" />
      </div>
    </StitchPanel>
  );
}

function LeagueActivity({ leagues }: { leagues: LeagueSummary[] }) {
  return (
    <section className="stitch-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b stitch-divider p-4 sm:p-5">
        <div>
          <p className="stitch-label text-muted-foreground">Паддок друзей</p>
          <h2 className="mt-2 font-display text-2xl font-bold">Активные лиги</h2>
        </div>
        <Badge variant="secondary">{leagues.length} лиг</Badge>
      </div>
      <div className="divide-y stitch-divider">
        {leagues.length ? (
          leagues.slice(0, 4).map((league) => (
            <article
              className="grid gap-3 p-4 transition-colors hover:bg-accent/45 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={league.id ?? league.name}
            >
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg font-bold">{league.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {league.members} участников, лидер — {league.leader}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <DataRow label="Очки лидера" value={String(league.score)} />
                <DataRow label="Код" value={league.inviteCode ?? "Закрытая"} />
              </div>
            </article>
          ))
        ) : (
          <p className="p-5 text-sm leading-6 text-muted-foreground">
            Пока нет активных лиг. Создай первую и отправь друзьям код приглашения.
          </p>
        )}
      </div>
    </section>
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

function buildPredictionFields(current: PredictionState["current"]): PredictionField[] {
  return [
    {
      helper: "Выбери пилота",
      label: "Победитель гонки",
      name: "winnerDriverId",
      short: "Race winner",
      value: current?.winnerDriverId,
    },
    {
      helper: "Выбери пилота",
      label: "Поул",
      name: "poleDriverId",
      short: "Pole position",
      value: current?.poleDriverId,
    },
    {
      helper: "Выбери пилота",
      label: "Лучший круг",
      name: "fastestLapDriverId",
      short: "Fastest lap",
      value: current?.fastestLapDriverId,
    },
    {
      helper: "Выбери пилота",
      label: "Первый сход",
      name: "dnfDriverId",
      short: "DNF",
      value: current?.dnfDriverId,
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

  if (status.message) {
    return {
      icon: ClipboardList,
      text: "Не получилось выполнить действие. Проверь данные и попробуй еще раз.",
      tone: "warning" as const,
    };
  }

  return null;
}
