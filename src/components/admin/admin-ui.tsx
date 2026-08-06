import { CircleAlert, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-balance text-2xl font-bold tracking-[-0.02em] md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-[72ch] text-pretty text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function AdminPage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 p-4 md:p-6 lg:p-8">{children}</div>;
}

export function AdminMetric({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className="min-w-0 border-l border-border px-4 first:border-l-0 first:pl-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-2xl font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {helper ? <p className="mt-1 truncate text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

export function AdminSection({
  title,
  description,
  actions,
  children,
  id,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-card", className)} id={id}>
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description ? <p className="mt-1 max-w-[72ch] text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant =
    /success|published|ready|active|healthy|sent|succeeded|completed|generated|edited|unique|processed|approved/.test(normalized)
      ? "success"
      : /fail|error|reject|danger|unavailable/.test(normalized)
        ? "danger"
        : /queued|pending|review|stale|warning|processing|running|partial|duplicate|checking|sending/.test(normalized)
          ? "warning"
          : "secondary";
  const label = statusLabels[normalized] ?? status;

  return <Badge variant={variant}>{label}</Badge>;
}

export function AdminDigestMeta({
  dateKey,
  status,
}: {
  dateKey: string | null;
  status: string;
}) {
  const archived = isPastMoscowDate(dateKey);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium">{formatDigestDate(dateKey)}</p>
      <div className="flex flex-wrap items-center gap-2">
        {archived ? <Badge variant="outline">Архив</Badge> : null}
        <AdminStatusBadge status={status} />
      </div>
    </div>
  );
}

export function AdminEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="min-h-56 rounded-none border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Inbox aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent />
    </Empty>
  );
}

export function AdminErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
      <CircleAlert aria-hidden="true" className="size-7 text-danger" />
      <p className="max-w-[55ch] text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}

export function AdminPagination({
  pathname,
  page,
  pageSize,
  total,
  search,
  status,
}: {
  pathname: string;
  page: number;
  pageSize: number;
  total: number;
  search?: string;
  status?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const previousHref = makePageHref(pathname, Math.max(1, page - 1), search, status);
  const nextHref = makePageHref(pathname, Math.min(pages, page + 1), search, status);

  return (
    <Pagination className="border-t border-border p-3">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious aria-disabled={page <= 1} href={previousHref} />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href={makePageHref(pathname, page, search, status)} isActive>
            {page} из {pages}
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext aria-disabled={page >= pages} href={nextHref} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export function AdminTechnicalValue({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-64 max-w-full overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-5 text-muted-foreground">
      {text || "Нет дополнительных данных"}
    </pre>
  );
}

const statusLabels: Record<string, string> = {
  active: "Активно",
  ai_failed: "Ошибка обработки",
  approved: "Проверено",
  archived: "Архив",
  cancelled: "Отменено",
  checking: "Проверяется",
  closed: "Закрыт",
  complete: "Готово",
  completed: "Завершено",
  draft: "Черновик",
  duplicate: "Дубль",
  edited: "Отредактировано",
  failed: "Ошибка",
  fallback: "Резервный текст",
  generated: "Подготовлено",
  healthy: "В норме",
  hidden: "Скрыто",
  indexed: "Добавлено",
  legacy: "Прежний запрос",
  open: "Открыт",
  partial: "Частично готово",
  paused: "На паузе",
  pending: "Ожидает",
  processed: "Обработано",
  processing: "Обработка",
  processing_dedup: "Проверка дублей",
  published: "Опубликовано",
  queued: "В очереди",
  ready: "Готово",
  rejected: "Отклонено",
  review: "На проверке",
  running: "Выполняется",
  scheduled: "Запланировано",
  sending: "Отправляется",
  sent: "Отправлено",
  skipped: "Пропущено",
  stale: "Устарело",
  started: "Начато",
  success: "Готово",
  succeeded: "Готово",
  unavailable: "Недоступно",
  unknown: "Нет данных",
  unique: "Не дубль",
  warning: "Нужна проверка",
};

function isPastMoscowDate(dateKey: string | null) {
  return Boolean(dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey < getMoscowDateKey());
}

function getMoscowDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
    year: "numeric",
  }).format(new Date());
}

function formatDigestDate(dateKey: string | null) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "Дата сводки не указана";

  return `Сводка за ${new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeZone: "Europe/Moscow",
  }).format(new Date(`${dateKey}T12:00:00Z`))}`;
}

function makePageHref(pathname: string, page: number, search?: string, status?: string) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (search) params.set("search", search);
  if (status && status !== "all") params.set("status", status);
  return `${pathname}?${params.toString()}`;
}
