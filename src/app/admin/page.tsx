import { Bot, Database, Play } from "lucide-react";

import {
  addManualXPost,
  editGrandPrixReportSummary,
  queueGrandPrixReportReload,
  queueGrandPrixReportSummary,
  toggleGrandPrixReportVisibility,
  toggleSocialSource,
  toggleSource,
  triggerJob,
} from "@/app/admin/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { DataRow } from "@/components/racemate/data-row";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAdminSources,
  getAdminSocialSources,
  getAdminGrandPrixReports,
  getAdminJobs,
  getAdminSignals,
  getAiUsageSummary,
} from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ queued?: string; source?: string }>;
}) {
  const status = await searchParams;
  const user = await getSessionUser();
  const [adminJobs, adminSignals, adminSources, adminSocialSources, adminReports, aiUsage] = await Promise.all([
    getAdminJobs(),
    getAdminSignals(),
    getAdminSources(),
    getAdminSocialSources(),
    getAdminGrandPrixReports(),
    getAiUsageSummary(),
  ]);

  return (
    <AppShell>
      <PageHeading title="Админка RaceMate" />

      <section className="grid grid-cols-2 gap-3 pt-8 lg:grid-cols-4">
        <StitchMetric label="AI runs" value={String(aiUsage.totalRuns)} />
        <StitchMetric label="AI cost" value={`$${aiUsage.estimatedCostUsd.toFixed(4)}`} />
        <StitchMetric label="Jobs" tone="live" value={String(adminJobs.length)} />
        <StitchMetric label="Sources" value={String(adminSources.length + adminSocialSources.length)} />
      </section>

      <section className="grid gap-5 py-5 lg:grid-cols-[0.68fr_1fr]">
        <StitchPanel>
          <StitchPanelHeader
            icon={Database}
            meta="Быстрый вход в источники, job runs и AI usage."
            title="Состояние системы"
          />
          <div className="grid gap-3 p-4">
            {adminSignals.map((signal) => (
              <DataRow
                helper={signal.status}
                key={signal.label}
                label={signal.label}
                value={signal.value}
              />
            ))}
            <DataRow
              helper={aiUsage.lastModel}
              label="AI usage"
              value={`${aiUsage.totalRuns} / $${aiUsage.estimatedCostUsd.toFixed(4)}`}
            />
            {status.queued ? (
              <p className="text-sm text-muted-foreground">Задача добавлена в очередь.</p>
            ) : null}
            {status.source ? (
              <p className="text-sm text-muted-foreground">Источник обновлен.</p>
            ) : null}
          </div>
        </StitchPanel>

        <StitchPanel>
          <div className="border-b stitch-divider p-4 md:flex md:items-start md:justify-between md:gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <Bot aria-hidden="true" data-icon="inline-start" />
                Последние задачи
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Worker будет писать сюда статус, количество обработанных элементов
                и ошибку, если задача упала.
              </p>
            </div>
            <form action={triggerJob} className="flex flex-wrap gap-2">
              <select
                className="min-h-9 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                name="jobName"
              >
                <option value="rss.fetch_all">RSS</option>
                <option value="social.fetch_all">Соцсети</option>
                <option value="reports.check_latest">Отчет Гран-при</option>
                <option value="reports.refresh_due">Обновить отчеты</option>
                <option value="reports.generate_summary">AI отчетов</option>
                <option value="ai.process_news">AI новости</option>
                <option value="ai.retag_news">Теги этапов</option>
                <option value="jolpica.sync_calendar">Календарь</option>
                <option value="jolpica.sync_results">Результаты</option>
                <option value="jolpica.sync_standings">Таблицы</option>
                <option value="openf1.sync_sessions">OpenF1</option>
                <option value="openf1.sync_laps">Лучшие круги</option>
                <option value="weather.sync_weekend">Погода</option>
                <option value="predictions.score">Очки прогнозов</option>
              </select>
              <Button disabled={!user} size="sm" type="submit" variant="secondary">
                <Play aria-hidden="true" data-icon="inline-start" />
                {user ? "Запустить" : "Только для админа"}
              </Button>
            </form>
          </div>
          <div className="grid gap-3 p-4">
            {adminJobs.map((job) => (
              <div
                className="grid gap-3 rounded-md border border-border/70 p-4 md:grid-cols-[1fr_auto_auto]"
                key={job.name}
              >
                <div>
                  <p className="font-mono text-sm">{job.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {job.finishedAt}
                  </p>
                </div>
                <Badge variant={job.status === "Успешно" ? "success" : "warning"}>
                  {job.status}
                </Badge>
                <span className="font-mono text-sm text-muted-foreground">
                  {job.processed}
                </span>
              </div>
            ))}
          </div>
        </StitchPanel>
      </section>

      <section className="grid gap-5 pb-8">
        <Card>
          <CardHeader>
            <CardTitle>Отчеты Гран-при</CardTitle>
            <CardDescription>
              Готовые и частичные отчеты видны на сайте. Остальные ждут данных или повторной обработки.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {adminReports.length ? adminReports.map((report) => (
              <div
                className="grid gap-4 rounded-md border border-border/70 p-4"
                key={report.id}
              >
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={report.isHidden ? "secondary" : "outline"}>
                        {report.isHidden ? "Скрыт" : "На сайте"}
                      </Badge>
                      <Badge variant={report.status === "Готов" ? "success" : "warning"}>
                        {report.status}
                      </Badge>
                      <Badge variant="outline">{report.summaryStatus}</Badge>
                    </div>
                    <p className="mt-3 font-medium">
                      {report.raceName} · {report.season}, раунд {report.round}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Сформирован: {report.generatedAt} · следующее обновление: {report.nextRefreshAt}
                    </p>
                    {report.lastError ? (
                      <p className="mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-5 text-danger">
                        {report.lastError}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <form action={toggleGrandPrixReportVisibility}>
                      <input name="reportId" type="hidden" value={report.id} />
                      <input name="isHidden" type="hidden" value={String(report.isHidden)} />
                      <Button disabled={!user} size="sm" type="submit" variant="secondary">
                        {report.isHidden ? "Показать" : "Скрыть"}
                      </Button>
                    </form>
                    <form action={queueGrandPrixReportReload}>
                      <input name="reportId" type="hidden" value={report.id} />
                      <input name="season" type="hidden" value={report.season} />
                      <input name="round" type="hidden" value={report.round} />
                      <Button disabled={!user} size="sm" type="submit" variant="secondary">
                        Загрузить заново
                      </Button>
                    </form>
                    <form action={queueGrandPrixReportSummary}>
                      <input name="reportId" type="hidden" value={report.id} />
                      <input name="season" type="hidden" value={report.season} />
                      <input name="round" type="hidden" value={report.round} />
                      <Button disabled={!user} size="sm" type="submit" variant="secondary">
                        Повторить AI
                      </Button>
                    </form>
                  </div>
                </div>
                <form action={editGrandPrixReportSummary} className="grid gap-2">
                  <input name="reportId" type="hidden" value={report.id} />
                  <textarea
                    className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    defaultValue={report.aiSummary ?? ""}
                    name="summary"
                    placeholder="Короткий итог гонки для блока отчета"
                  />
                  <div className="flex justify-end">
                    <Button disabled={!user} size="sm" type="submit" variant="secondary">
                      Сохранить саммари
                    </Button>
                  </div>
                </form>
              </div>
            )) : (
              <div className="rounded-md border border-border/70 p-5 text-sm text-muted-foreground">
                Отчетов пока нет. Запусти задачу «Отчет Гран-при», когда появятся результаты гонки.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Источники новостей</CardTitle>
            <CardDescription>
              Активные источники попадают в следующий запуск RSS worker.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {adminSources.map((source) => (
              <div
                className="grid gap-3 rounded-md border border-border/70 p-4 md:grid-cols-[1fr_auto_auto]"
                key={source.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{source.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {source.url}
                  </p>
                </div>
                <Badge variant={source.isActive ? "success" : "secondary"}>
                  {source.isActive ? "Активен" : "На паузе"}
                </Badge>
                <form action={toggleSource}>
                  <input name="sourceId" type="hidden" value={source.id} />
                  <input name="isActive" type="hidden" value={String(source.isActive)} />
                  <Button disabled={!user} size="sm" type="submit" variant="secondary">
                    {source.isActive ? "Пауза" : "Включить"}
                  </Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Соцсети</CardTitle>
            <CardDescription>
              Сейчас в публичную ленту попадает X через RSSHub или ручные ссылки.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <form action={addManualXPost} className="grid gap-3 rounded-md border border-border/70 p-4">
              <div>
                <p className="text-sm font-medium">Добавить X-пост вручную</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Резервный путь, если бесплатный X-источник временно не работает.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_0.6fr]">
                <input
                  className="min-h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  name="url"
                  placeholder="https://x.com/user/status/..."
                  required
                  type="url"
                />
                <input
                  className="min-h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  name="author"
                  placeholder="@author"
                  type="text"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_0.8fr_auto]">
                <input
                  className="min-h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  name="title"
                  placeholder="Короткий текст поста"
                  type="text"
                />
                <input
                  className="min-h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  name="imageUrl"
                  placeholder="Ссылка на изображение"
                  type="url"
                />
                <Button disabled={!user} type="submit" variant="secondary">
                  Добавить
                </Button>
              </div>
            </form>

            {adminSocialSources.map((source) => (
              <div
                className="grid gap-3 rounded-md border border-border/70 p-4 md:grid-cols-[1fr_auto_auto]"
                key={source.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={source.platform === "x" ? "outline" : "secondary"}>
                      {source.platform === "x" ? "X" : "Reddit"}
                    </Badge>
                    <p className="truncate text-sm font-medium">{source.name}</p>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {source.adapter} · {source.url}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{source.lastStatus}</p>
                </div>
                <Badge variant={source.isActive ? "success" : "secondary"}>
                  {source.isActive ? "Активен" : "На паузе"}
                </Badge>
                <form action={toggleSocialSource}>
                  <input name="sourceId" type="hidden" value={source.id} />
                  <input name="isActive" type="hidden" value={String(source.isActive)} />
                  <Button disabled={!user} size="sm" type="submit" variant="secondary">
                    {source.isActive ? "Пауза" : "Включить"}
                  </Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
