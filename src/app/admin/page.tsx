import Link from "next/link";
import { Bot, Database, Play } from "lucide-react";

import {
  addManualXPost,
  deleteDriverAvatar,
  editGrandPrixReportSummary,
  moderateSocialPost,
  queueGrandPrixReportReload,
  queueGrandPrixReportSummary,
  saveSocialSource,
  toggleGrandPrixReportVisibility,
  toggleSocialSource,
  toggleSource,
  triggerJob,
  updateDriverAdminProfile,
  uploadDriverAvatar,
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
  getAdminSocialPosts,
  getAdminDrivers,
  getAdminGrandPrixReports,
  getAdminJobs,
  getAdminSignals,
  getAdminTeamOptions,
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
  const [adminJobs, adminSignals, adminSources, adminSocialSources, adminSocialPosts, adminReports, adminDrivers, adminTeams, aiUsage] = await Promise.all([
    getAdminJobs(),
    getAdminSignals(),
    getAdminSources(),
    getAdminSocialSources(),
    getAdminSocialPosts(),
    getAdminGrandPrixReports(),
    getAdminDrivers(),
    getAdminTeamOptions(),
    getAiUsageSummary(),
  ]);
  const socialQueueCounts = {
    processing: adminSocialPosts.filter((post) => post.status === "pending" || post.status === "processing").length,
    review: adminSocialPosts.filter((post) => post.status === "review").length,
    published: adminSocialPosts.filter((post) => post.status === "published").length,
    rejected: adminSocialPosts.filter((post) => post.status === "rejected").length,
  };

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
                <option value="ai.reprocess_fallback_news">Повторить AI новости</option>
                <option value="ai.retag_news">Теги этапов</option>
                <option value="circuit_stats.sync_all">Статистика трасс</option>
                <option value="circuit_stats.sync">Статистика текущей трассы</option>
                <option value="jolpica.sync_calendar">Календарь</option>
                <option value="jolpica.sync_results">Результаты</option>
                <option value="jolpica.sync_standings">Таблицы</option>
                <option value="openf1.sync_sessions">OpenF1</option>
                <option value="openf1.sync_laps">Лучшие круги</option>
                <option value="weather.sync_weekend">Погода</option>
                <option value="predictions.score">Очки прогнозов</option>
                <option value="race_replay.prepare_current">Повтор текущего этапа</option>
                <option value="race_replay.prepare_completed">Повторы прошедших этапов</option>
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
            <CardTitle>Гонщики</CardTitle>
            <CardDescription>
              Slug, страна и AI-аватар используются на публичных профилях гонщиков.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {adminDrivers.length ? adminDrivers.map((driver) => (
              <div
                className="grid gap-4 rounded-md border border-border/70 p-4"
                key={driver.id}
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{driver.code ?? "Код"}</Badge>
                      <Badge variant="secondary">{driver.team}</Badge>
                      {driver.aiAvatarUrl ? <Badge variant="success">AI-аватар</Badge> : null}
                    </div>
                    <p className="mt-3 font-display text-lg font-bold">{driver.fullName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      /drivers/{driver.slug || "slug-ne-zadan"} · № {driver.number ?? "—"}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/drivers/${driver.slug}`} prefetch={false}>
                      Открыть профиль
                    </Link>
                  </Button>
                </div>

                <form action={updateDriverAdminProfile} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <input name="driverId" type="hidden" value={driver.id} />
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Slug
                    <input
                      className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                      defaultValue={driver.slug}
                      name="slug"
                      required
                      type="text"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Номер
                    <input
                      className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                      defaultValue={driver.number ?? ""}
                      name="permanentNumber"
                      type="number"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Страна
                    <input
                      className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                      defaultValue={driver.country ?? ""}
                      name="country"
                      type="text"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Код страны
                    <input
                      className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                      defaultValue={driver.countryCode ?? ""}
                      maxLength={2}
                      name="countryCode"
                      type="text"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Команда
                    <select
                      className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                      defaultValue={driver.teamId ?? ""}
                      name="teamId"
                    >
                      <option value="">Команда уточняется</option>
                      {adminTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input name="avatarPlaceholderStyle" type="hidden" value="helmet" />
                  <div className="md:col-span-2 xl:col-span-5">
                    <Button disabled={!user} size="sm" type="submit" variant="secondary">
                      Сохранить данные
                    </Button>
                  </div>
                </form>

                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <form action={uploadDriverAvatar} className="grid gap-2">
                    <input name="driverId" type="hidden" value={driver.id} />
                    <input name="slug" type="hidden" value={driver.slug} />
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      AI-аватар
                      <input
                        accept="image/webp,image/png,image/jpeg"
                        className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:text-secondary-foreground"
                        name="avatar"
                        type="file"
                      />
                    </label>
                    <Button disabled={!user} size="sm" type="submit">
                      Загрузить аватар
                    </Button>
                  </form>
                  {driver.aiAvatarUrl ? (
                    <form action={deleteDriverAvatar}>
                      <input name="driverId" type="hidden" value={driver.id} />
                      <input name="slug" type="hidden" value={driver.slug} />
                      <input name="avatarUrl" type="hidden" value={driver.aiAvatarUrl} />
                      <Button disabled={!user} size="sm" type="submit" variant="outline">
                        Удалить аватар
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            )) : (
              <div className="rounded-md border border-border/70 p-5 text-sm text-muted-foreground">
                Гонщики появятся после синхронизации календаря и результатов.
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
            <CardTitle>Social Hub</CardTitle>
            <CardDescription>
              Источники X, Reddit и Telegram проходят AI-проверку до публикации. Каналы Telegram читаются через отдельный аккаунт RaceMate.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <form action={saveSocialSource} className="grid gap-3 rounded-md border border-border/70 p-4">
              <div>
                <p className="text-sm font-medium">Добавить источник</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Повторное сохранение той же ссылки обновит её настройки.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Площадка
                  <select className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" name="platform" required>
                    <option value="x">X</option>
                    <option value="reddit">Reddit</option>
                    <option value="telegram">Telegram</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Название в RaceMate
                  <input className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" name="name" placeholder="Например, Autosport" required />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Аккаунт или канал
                  <input className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" name="externalKey" placeholder="@channel или -100…" />
                </label>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Для Telegram достаточно username, ссылки или ID. Приватный канал сначала откройте аккаунту RaceMate.
              </p>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Ссылка на источник
                <input className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" name="url" placeholder="https://t.me/channel" type="url" />
              </label>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Подключение
                  <select className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" name="adapter" defaultValue="x-api-user">
                    <option value="x-api-user">X API</option><option value="rsshub-x-user">X через RSSHub</option><option value="reddit-oauth">Reddit OAuth</option><option value="telegram-mtproto">Telegram MTProto</option><option value="telegram-bot-webhook">Telegram Bot</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Доверие
                  <select className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" name="trustLevel" defaultValue="community">
                    <option value="official">Официальный</option><option value="media">СМИ</option><option value="community">Сообщество</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Публикация
                  <select className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" name="publicationMode" defaultValue="auto">
                    <option value="auto">После AI-проверки</option><option value="review">Через модерацию</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Порядок Reddit
                  <select className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" name="feedKind" defaultValue="new">
                    <option value="new">Новые</option><option value="hot">Популярные</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Интервал, мин
                  <input className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" min="5" name="fetchIntervalMinutes" defaultValue="15" type="number" />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Первая загрузка, дней
                  <input className="min-h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground" min="1" max="365" name="initialBackfillDays" defaultValue="30" type="number" />
                </label>
              </div>
              <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
                <label className="inline-flex items-center gap-2"><input name="includeReposts" type="checkbox" />Загружать репосты и пересланные посты</label>
                <label className="inline-flex items-center gap-2"><input name="includeReplies" type="checkbox" />Загружать ответы</label>
              </div>
              <Button className="justify-self-start" disabled={!user} type="submit" variant="secondary">Сохранить источник</Button>
            </form>

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
                      {source.platform === "telegram" ? "Telegram" : source.platform === "x" ? "X" : "Reddit"}
                    </Badge>
                    <p className="truncate text-sm font-medium">{source.name}</p>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {source.adapter} · {source.url}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getTrustLabel(source.trustLevel)} · {getPublicationModeLabel(source.publicationMode)} · первая загрузка за {source.initialBackfillDays} дн.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {source.lastSuccessAt ? `Последняя синхронизация: ${new Date(source.lastSuccessAt).toLocaleString("ru-RU")}` : source.lastStatus}
                  </p>
                  {source.lastError ? <p className="mt-1 text-xs leading-5 text-danger">{source.lastError}</p> : null}
                  {source.rateLimitedUntil ? <p className="mt-1 text-xs text-warning">Лимит до {new Date(source.rateLimitedUntil).toLocaleString("ru-RU")}</p> : null}
                </div>
                <Badge variant={source.isActive ? "success" : "secondary"}>
                  {source.isActive ? "Активен" : "На паузе"}
                </Badge>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {source.adapter === "telegram-mtproto" ? (
                    <form action={triggerJob}>
                      <input name="jobName" type="hidden" value="social.fetch_telegram" />
                      <input name="sourceId" type="hidden" value={source.id} />
                      <Button disabled={!user} size="sm" type="submit" variant="outline">Проверить и загрузить</Button>
                    </form>
                  ) : null}
                  <form action={toggleSocialSource}>
                    <input name="sourceId" type="hidden" value={source.id} />
                    <input name="isActive" type="hidden" value={String(source.isActive)} />
                    <Button disabled={!user} size="sm" type="submit" variant="secondary">
                      {source.isActive ? "Пауза" : "Включить"}
                    </Button>
                  </form>
                </div>
              </div>
            ))}

            <div className="border-t stitch-divider pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Очередь публикаций</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ошибки одной записи не останавливают обработку остальных.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["social.process_ai", "social.retry_failed", "social.refresh_metrics"].map((job) => (
                    <form action={triggerJob} key={job}>
                      <input name="jobName" type="hidden" value={job} />
                      <Button disabled={!user} size="sm" type="submit" variant="secondary">
                        {job === "social.process_ai" ? "Обработать" : job === "social.retry_failed" ? "Повторить ошибки" : "Обновить метрики"}
                      </Button>
                    </form>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                <DataRow label="На обработке" value={String(socialQueueCounts.processing)} />
                <DataRow label="Нужна проверка" value={String(socialQueueCounts.review)} />
                <DataRow label="Опубликовано" value={String(socialQueueCounts.published)} />
                <DataRow label="Отклонено" value={String(socialQueueCounts.rejected)} />
              </div>
              <div className="mt-4 grid gap-2">
                {adminSocialPosts.map((post) => (
                  <form action={moderateSocialPost} className="grid items-center gap-2 rounded-md border border-border/70 p-3 md:grid-cols-[auto_minmax(0,1fr)_10rem_auto]" key={post.id}>
                    <input name="postId" type="hidden" value={post.id} />
                    <Badge variant={post.status === "published" ? "success" : post.status === "review" ? "warning" : post.status === "rejected" ? "danger" : "secondary"}>{post.status}</Badge>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{post.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{post.platform} · {post.author}{post.error ? ` · ${post.error}` : ""}</p>
                    </div>
                    <select className="h-9 rounded-md border border-input bg-background px-2 text-xs" name="topic" defaultValue="">
                      <option value="">Категория AI</option>
                      <option value="social-upgrades">Обновления болида</option><option value="social-transfers">Трансферы</option><option value="social-technical">Техника</option><option value="social-race-weekend">Этап</option><option value="social-statements">Комментарии</option><option value="social-incidents">Инциденты</option><option value="social-rumors">Слухи</option><option value="social-discussion">Обсуждения</option>
                    </select>
                    <div className="flex gap-1">
                      <Button name="moderationAction" size="sm" type="submit" value="publish" variant="secondary">Опубликовать</Button>
                      <Button aria-label="Повторить AI" className="px-2" name="moderationAction" size="sm" type="submit" value="retry" variant="ghost">AI</Button>
                      <Button aria-label="Отклонить" className="px-2" name="moderationAction" size="sm" type="submit" value="reject" variant="ghost">×</Button>
                    </div>
                  </form>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}

function getTrustLabel(value: "official" | "media" | "community") {
  return value === "official" ? "Официальный источник" : value === "media" ? "СМИ" : "Сообщество";
}

function getPublicationModeLabel(value: "auto" | "review") {
  return value === "review" ? "Через модерацию" : "После AI-проверки";
}
