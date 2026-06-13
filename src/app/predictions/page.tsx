import { Lock, Trophy } from "lucide-react";

import { savePrediction } from "@/app/predictions/actions";
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
import { getPredictionState } from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getSessionUser();
  const { saved } = await searchParams;
  const predictionState = await getPredictionState(user?.id);
  const current = predictionState.current;

  return (
    <AppShell>
      <PageHeading
        badge="Прогнозы"
        description="Первый игровой слой RaceMate: победитель, поул, топ-3, топ-10, лучший круг и DNF с простой системой очков."
        title="Собери прогноз до блокировки уикенда"
      />

      <section className="grid gap-5 py-8 lg:grid-cols-[1fr_0.72fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy aria-hidden="true" data-icon="inline-start" />
              Мой прогноз на Канаду
            </CardTitle>
            <CardDescription>
              {predictionState.race
                ? `${predictionState.race.name}. Старт: ${predictionState.race.startsAt}.`
                : "Гонка появится после синхронизации календаря."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {predictionState.race && predictionState.drivers.length ? (
              <form action={savePrediction} className="grid gap-4">
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
                {saved ? (
                  <p className="text-sm text-muted-foreground">
                    Прогноз сохранен. Можно вернуться и поправить его до блокировки.
                  </p>
                ) : null}
                <Button className="mt-2" disabled={!user} type="submit">
                  {user ? "Сохранить прогноз" : "Войти, чтобы сохранить"}
                </Button>
              </form>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Прогноз откроется, когда worker подтянет гонку и список пилотов.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock aria-hidden="true" data-icon="inline-start" />
              Правила блокировки
            </CardTitle>
            <CardDescription>
              Прогнозы закрываются за 15 минут до первой зачетной сессии.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Badge variant="warning">До блокировки 2 дня</Badge>
            <DataRow
              label="Текущий счет"
              value={current?.score === null || current?.score === undefined ? "Еще не посчитан" : String(current.score)}
            />
            <p className="text-sm leading-6 text-muted-foreground">
              После результатов worker посчитает очки и обновит лидерборды лиг.
            </p>
          </CardContent>
        </Card>
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
