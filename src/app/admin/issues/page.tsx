import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { updateUserErrorReportAction } from "@/app/admin/operations";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminFilters } from "@/components/admin/admin-filters";
import {
  AdminEmpty,
  AdminMetric,
  AdminPage,
  AdminPageHeader,
  AdminPagination,
  AdminSection,
  AdminStatusBadge,
  AdminTechnicalValue,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { loadAdminUserErrorReports, parseAdminTableQuery } from "@/data/admin-repository";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminIssuesPage({ searchParams }: PageProps) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Серверный клиент админки недоступен");
  const query = parseAdminTableQuery(await searchParams);
  const data = await loadAdminUserErrorReports(admin, query);

  return (
    <AdminPage>
      <AdminPageHeader
        description="Сообщения читателей о неточностях в новостях. Данные для диагностики не содержат IP, Telegram ID и секретов."
        title="Сообщения читателей"
      />
      <section className="grid grid-cols-2 gap-y-5 border-b border-border pb-5 lg:grid-cols-4">
        <AdminMetric label="Новые" tone={data.metrics.new ? "warning" : "default"} value={String(data.metrics.new)} />
        <AdminMetric label="В работе" value={String(data.metrics.inProgress)} />
        <AdminMetric label="Исправлены" value={String(data.metrics.resolved)} />
        <AdminMetric label="Всего" value={String(data.total)} />
      </section>
      <AdminSection description={`${data.total} сообщений по текущему запросу.`} title="Сообщения">
        <AdminFilters
          search={query.search}
          status={query.status}
          statuses={[
            { value: "new", label: "Новые" },
            { value: "in_progress", label: "В работе" },
            { value: "resolved", label: "Исправлены" },
            { value: "dismissed", label: "Закрыты без исправления" },
          ]}
        />
        {data.items.length ? (
          <div className="grid">
            {data.items.map((report) => (
              <article className="grid gap-4 border-b border-border p-4 last:border-b-0 xl:grid-cols-[minmax(0,1fr)_22rem]" key={report.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusBadge status={report.status} />
                    <span className="text-xs text-muted-foreground">{formatDate(report.createdAt)}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">Telegram <AdminStatusBadge status={report.telegramDeliveryStatus} /></span>
                  </div>
                  <h2 className="mt-3 text-base font-semibold leading-6">{report.articleTitle}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{report.sourceName ?? "Источник не указан"}</p>
                  <blockquote className="mt-4 border-l-2 border-primary pl-4 text-sm leading-6">{report.message}</blockquote>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/news/${report.articleSlug}`} target="_blank">Открыть материал<ExternalLink aria-hidden="true" data-icon="inline-end" /></Link>
                    </Button>
                  </div>
                  <details className="mt-4 rounded-md border border-border bg-muted/25">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Данные для диагностики</summary>
                    <div className="grid gap-3 border-t border-border p-3 text-xs text-muted-foreground sm:grid-cols-2">
                      <TechnicalRow label="Страница" value={report.pagePath} />
                      <TechnicalRow label="Переход со страницы" value={report.referrerPath ?? "Нет данных"} />
                      <TechnicalRow label="Версия сайта" value={report.releaseSha ?? "Не указана"} />
                      <TechnicalRow label="Пользователь вошёл" value={report.isAuthenticated ? "Да" : "Нет"} />
                      <TechnicalRow label="Браузер" value={report.userAgent ?? "Не определён"} />
                      <TechnicalRow label="Отпечаток запроса" value={report.requestFingerprint?.slice(0, 12) ?? "Не создан"} />
                      {report.telegramDeliveryError ? <TechnicalRow label="Доставка в Telegram" value={report.telegramDeliveryError} /> : null}
                      <div className="sm:col-span-2"><AdminTechnicalValue value={report.technicalContext} /></div>
                    </div>
                  </details>
                </div>
                <AdminActionForm action={updateUserErrorReportAction} className="content-start" submitLabel="Сохранить">
                  <input name="reportId" type="hidden" value={report.id} />
                  <Field>
                    <FieldLabel htmlFor={`issue-status-${report.id}`}>Состояние</FieldLabel>
                    <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" defaultValue={report.status} id={`issue-status-${report.id}`} name="status">
                      <option value="new">Новое</option>
                      <option value="in_progress">В работе</option>
                      <option value="resolved">Исправлено</option>
                      <option value="dismissed">Закрыть без исправления</option>
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`issue-note-${report.id}`}>Заметка</FieldLabel>
                    <Textarea defaultValue={report.adminNote ?? ""} id={`issue-note-${report.id}`} name="adminNote" placeholder="Что проверили или исправили" rows={4} />
                  </Field>
                </AdminActionForm>
              </article>
            ))}
            <AdminPagination page={query.page} pageSize={query.pageSize} pathname="/admin/issues" search={query.search} status={query.status} total={data.total} />
          </div>
        ) : (
          <AdminEmpty description="Новые сообщения читателей появятся здесь." title="Сообщений по запросу нет" />
        )}
      </AdminSection>
    </AdminPage>
  );
}

function TechnicalRow({ label, value }: { label: string; value: string }) {
  return <p className="min-w-0"><span className="font-medium text-foreground">{label}:</span> <span className="break-words">{value}</span></p>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}
