import { Lock, Trophy, Users } from "lucide-react";

import {
  createFantasyLeague,
  joinFantasyLeague,
  saveFantasyPrediction,
} from "@/app/fantasy/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { DataRow } from "@/components/racemate/data-row";
import { PageHeading } from "@/components/racemate/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLeagues, getPredictionState } from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";

export default async function FantasyPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    joined?: string;
    message?: string;
    saved?: string;
  }>;
}) {
  const [status, user] = await Promise.all([searchParams, getSessionUser()]);
  const [predictionState, leagues] = await Promise.all([
    getPredictionState(user?.id),
    getLeagues(),
  ]);
  const current = predictionState.current;

  return (
    <AppShell>
      <PageHeading
        description="Собери прогноз на этап, создай свою лигу и сравни очки с друзьями."
        title="Фентази лига"
      />

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_0.78fr]">
        <div className="grid min-w-0 gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy aria-hidden="true" data-icon="inline-start" />
                Прогноз на этап
              </CardTitle>
              <CardDescription>
                {predictionState.race
                  ? `${predictionState.race.name}. Старт: ${predictionState.race.startsAt}.`
                  : "Гонка появится после синхронизации календаря."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {predictionState.race && predictionState.drivers.length ? (
                <form action={saveFantasyPrediction} className="grid gap-4">
                  <input name="raceId" type="hidden" value={predictionState.race.id} />
                  <PredictionSelect
                    defaultValue={current?.winnerDriverId}
                    drivers={predictionState.drivers}
                    label="Победитель"
                    name="winnerDriverId"
                  />
                  <PredictionSelect
                    defaultValue={current?.poleDriverId}
                    drivers={predictionState.drivers}
                    label="Поул"
                    name="poleDriverId"
                  />
                  <PredictionSelect
                    defaultValue={current?.fastestLapDriverId}
                    drivers={predictionState.drivers}
                    label="Лучший круг"
                    name="fastestLapDriverId"
                  />
                  <PredictionSelect
                    defaultValue={current?.dnfDriverId}
                    drivers={predictionState.drivers}
                    label="Первый сход"
                    name="dnfDriverId"
                  />
                  {status.saved ? (
                    <p className="text-sm text-muted-foreground">
                      Прогноз сохранен. Его можно поправить до блокировки.
                    </p>
                  ) : null}
                  <Button className="mt-2" disabled={!user} type="submit">
                    {user ? "Сохранить прогноз" : "Войти, чтобы сохранить"}
                  </Button>
                </form>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  Прогноз откроется, когда RaceMate подтянет гонку и список пилотов.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock aria-hidden="true" data-icon="inline-start" />
                Блокировка прогноза
              </CardTitle>
              <CardDescription>
                Прогнозы закрываются за 15 минут до первой зачетной сессии.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Badge variant="warning">До блокировки 2 дня</Badge>
              <DataRow
                label="Текущий счет"
                value={
                  current?.score === null || current?.score === undefined
                    ? "Еще не посчитан"
                    : String(current.score)
                }
              />
              <p className="text-sm leading-6 text-muted-foreground">
                После результатов RaceMate посчитает очки и обновит таблицы лиг.
              </p>
            </CardContent>
          </Card>
        </div>

        <aside className="grid min-w-0 content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users aria-hidden="true" data-icon="inline-start" />
                Моя лига
              </CardTitle>
              <CardDescription>
                Создай лигу или войди по коду приглашения.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
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
                  <input name="isPublic" type="checkbox" />
                  Показывать в общем списке
                </label>
                <Button disabled={!user} type="submit">
                  {user ? "Создать лигу" : "Войти, чтобы создать"}
                </Button>
              </form>

              <form action={joinFantasyLeague} className="grid gap-3">
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
                <Button disabled={!user} type="submit" variant="secondary">
                  {user ? "Войти по коду" : "Войти, чтобы вступить"}
                </Button>
              </form>

              {status.created ? (
                <p className="text-sm text-muted-foreground">Лига создана.</p>
              ) : null}
              {status.joined ? (
                <p className="text-sm text-muted-foreground">Ты в лиге.</p>
              ) : null}
              {status.message ? (
                <p className="text-sm text-muted-foreground">
                  Не получилось выполнить действие. Проверь данные и попробуй еще раз.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {leagues.map((league) => (
              <Card key={league.name}>
                <CardHeader>
                  <CardTitle>{league.name}</CardTitle>
                  <CardDescription>
                    {league.members} участников, лидер — {league.leader}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DataRow label="Очки лидера" value={String(league.score)} />
                  {league.inviteCode ? (
                    <DataRow label="Код" value={league.inviteCode} />
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}

function PredictionSelect({
  defaultValue,
  drivers,
  label,
  name,
}: {
  defaultValue?: string | null;
  drivers: { id: string; name: string; team: string }[];
  label: string;
  name: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium" htmlFor={name}>
      {label}
      <select
        className="min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        defaultValue={defaultValue ?? ""}
        id={name}
        name={name}
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
