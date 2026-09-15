import { CreditCard, ShieldAlert, UsersRound } from "lucide-react";

import { AdminFilters } from "@/components/admin/admin-filters";
import { AdminConfirmedForm } from "@/components/admin/admin-confirmed-form";
import {
  AdminEmpty,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
} from "@/components/admin/admin-ui";
import { formatMoney, formatProvider } from "@/lib/billing/catalog";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  reconcileBillingPaymentAction,
  recordBillingRefundAction,
  resendBillingConfirmationAction,
} from "@/app/admin/operations";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminBillingPage({ searchParams }: PageProps) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Серверный клиент админки недоступен");
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const now = new Date().toISOString();

  const [ordersResult, subscriptionsResult, rejectedResult, eventsResult] = await Promise.all([
    admin.from("billing_orders").select("id, order_number, user_id, provider, payment_method, amount_minor, currency, duration_months, status, failure_reason, paid_at, created_at, provider_order_id, provider_label").order("created_at", { ascending: false }).limit(150),
    admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").gt("current_period_end", now),
    admin.from("billing_notification_events").select("id", { count: "exact", head: true }).in("status", ["rejected", "failed"]),
    admin.from("billing_notification_events").select("id, provider, provider_event_type, provider_reference, signature_valid, status, attempts, last_error, received_at").order("received_at", { ascending: false }).limit(40),
  ]);
  const firstError = ordersResult.error ?? subscriptionsResult.error ?? rejectedResult.error ?? eventsResult.error;
  if (firstError) throw firstError;

  const allOrders = ordersResult.data ?? [];
  const orderIds = allOrders.map((order) => order.id);
  const userIds = [...new Set(allOrders.map((order) => order.user_id))];
  const [profilesResult, transactionsResult, periodsResult] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id, display_name, email").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? admin.from("payment_transactions").select("order_id, provider_transaction_id, gross_amount_minor, net_amount_minor, provider_fee_minor, currency, occurred_at").in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? admin.from("subscription_periods").select("order_id, starts_at, ends_at, status").in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedError = profilesResult.error ?? transactionsResult.error ?? periodsResult.error;
  if (relatedError) throw relatedError;

  const profiles = profilesResult.data ?? [];
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const transactionByOrder = new Map((transactionsResult.data ?? []).map((transaction) => [transaction.order_id, transaction]));
  const periodByOrder = new Map((periodsResult.data ?? []).filter((period) => period.order_id).map((period) => [period.order_id, period]));
  const orders = allOrders.filter((order) => matchesOrder(order, search, transactionByOrder.get(order.id)));

  return (
    <AdminPage>
      <AdminPageHeader
        description="Заказы, активные периоды и безопасный журнал уведомлений ЮMoney и Tribute. Секреты и исходные подписанные данные здесь не показываются."
        title="Подписки и оплаты"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={UsersRound} label="Активные подписки" value={subscriptionsResult.count ?? 0} />
        <Metric icon={CreditCard} label="Заказы в списке" value={ordersResult.data?.length ?? 0} />
        <Metric icon={ShieldAlert} label="Требуют внимания" value={rejectedResult.count ?? 0} warning={Boolean(rejectedResult.count)} />
      </div>

      <AdminSection description="Поиск по номеру заказа, ID пользователя, ID операции, provider order ID или label." title="Заказы">
        <AdminFilters search={search} />
        {orders.length ? (
          <div className="grid divide-y divide-border">
            {orders.map((order) => {
              const profile = profileById.get(order.user_id);
              const transaction = transactionByOrder.get(order.id);
              const period = periodByOrder.get(order.id);
              return (
                <article className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-start" key={order.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-mono text-sm font-bold">{order.order_number}</h2>
                      <AdminStatusBadge status={statusTone(order.status)} />
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{profile?.display_name || "Без имени"} · {profile?.email || shortReference(order.user_id)}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{formatProvider(order.provider, order.payment_method)} · {shortReference(order.provider_order_id || order.provider_label || "ожидается")}</p>
                    {transaction ? <p className="mt-1 text-xs text-muted-foreground">Зачислено {formatMoney(Number(transaction.net_amount_minor), transaction.currency)} · комиссия {formatMoney(Number(transaction.provider_fee_minor), transaction.currency)} · операция <span className="font-mono">{shortReference(transaction.provider_transaction_id)}</span></p> : null}
                    {period ? <p className="mt-1 text-xs text-muted-foreground">Доступ: {formatDate(period.starts_at)} — {formatDate(period.ends_at)} · {period.status === "active" ? "активен" : period.status === "refunded" ? "возвращён" : "отозван"}</p> : null}
                  </div>
                  <div className="text-sm lg:text-right"><p className="font-display text-lg font-bold">{formatMoney(Number(order.amount_minor), order.currency)}</p><p className="text-xs text-muted-foreground">{order.duration_months === 12 ? "12 месяцев" : "1 месяц"}</p></div>
                  <div className="grid justify-items-start gap-2 lg:justify-items-end"><time className="text-xs text-muted-foreground" dateTime={order.paid_at || order.created_at}>{formatDate(order.paid_at || order.created_at)}</time><BillingOrderActions order={order} /></div>
                </article>
              );
            })}
          </div>
        ) : <AdminEmpty description="Проверьте номер заказа или идентификатор." title="Заказы не найдены" />}
      </AdminSection>

      <AdminSection description="Последние принятые и отклонённые callback-события без платёжных секретов." title="Уведомления провайдеров">
        <div className="grid divide-y divide-border">
          {(eventsResult.data ?? []).map((event) => (
            <article className="grid gap-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center" key={event.id}>
              <AdminStatusBadge status={event.status === "processed" ? "success" : event.status === "received" ? "pending" : "failed"} />
              <div className="min-w-0"><p className="font-medium">{event.provider === "yoomoney" ? "ЮMoney" : "Tribute"} · {event.provider_event_type}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{shortReference(event.provider_reference || "без ссылки")} · попыток: {event.attempts}</p>{event.last_error ? <p className="mt-1 text-xs text-danger">{event.last_error}</p> : null}</div>
              <time className="text-xs text-muted-foreground" dateTime={event.received_at}>{formatDate(event.received_at)}</time>
            </article>
          ))}
        </div>
      </AdminSection>
    </AdminPage>
  );
}

function Metric({ icon: Icon, label, value, warning = false }: { icon: typeof CreditCard; label: string; value: number; warning?: boolean }) {
  return <div className="rounded-lg border border-border bg-card p-4"><Icon aria-hidden="true" className={warning ? "size-5 text-danger" : "size-5 text-primary"} /><p className="mt-4 font-display text-3xl font-black tabular-nums">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></div>;
}

function matchesOrder(order: Record<string, unknown>, search: string, transaction?: { provider_transaction_id: string } | null) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [order.order_number, order.user_id, order.provider_order_id, order.provider_label, transaction?.provider_transaction_id]
    .some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function shortReference(value: string) {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "paid") return "success";
  if (status === "pending") return "pending";
  if (status === "refunded" || status === "partially_refunded") return "warning";
  return "failed";
}

function BillingOrderActions({ order }: { order: { id: string; amount_minor: number; status: string; failure_reason: string | null } }) {
  if (order.status === "paid") {
    return <div className="flex flex-wrap justify-end gap-2"><AdminConfirmedForm action={resendBillingConfirmationAction} className="w-full" confirmLabel="Отправить" description="Письмо будет заново поставлено в очередь. Новый период подписки не создаётся." submitLabel="Повторить письмо" submitVariant="outline" title="Отправить подтверждение ещё раз?"><input name="orderId" type="hidden" value={order.id} /></AdminConfirmedForm><details className="w-full rounded-md border border-danger/25 p-2 text-left"><summary className="cursor-pointer text-xs font-bold text-danger">Зафиксировать возврат</summary><AdminConfirmedForm action={recordBillingRefundAction} className="mt-3" confirmLabel="Возврат уже выполнен" description="Продолжайте только после фактического возврата денег у платёжного сервиса. Доступ пользователя будет пересчитан." submitLabel="Зафиксировать" submitVariant="outline" title="Возврат точно выполнен?"><input name="orderId" type="hidden" value={order.id} /><label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">Ссылка на возврат</span><input className="h-9 rounded-md border border-border bg-background px-3" maxLength={160} name="refundReference" required /></label><label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">Причина</span><input className="h-9 rounded-md border border-border bg-background px-3" maxLength={500} minLength={3} name="reason" required /></label></AdminConfirmedForm></details></div>;
  }
  if (order.status !== "pending" && !(order.status === "failed" && order.failure_reason === "CHECKOUT_EXPIRED")) return null;
  return <details className="w-64 rounded-md border border-border p-2 text-left"><summary className="cursor-pointer text-xs font-bold">Сверить оплату</summary><AdminConfirmedForm action={reconcileBillingPaymentAction} className="mt-3" confirmLabel="Подтвердить оплату" description="Продолжайте только после проверки операции в кабинете платёжного сервиса. Подтверждение сразу выдаст доступ." submitLabel="Подтвердить вручную" title="Операция действительно найдена?"><input name="orderId" type="hidden" value={order.id} /><label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">ID операции</span><input className="h-9 rounded-md border border-border bg-background px-3" maxLength={160} name="operationReference" required /></label><label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">Зачислено, ₽</span><input className="h-9 rounded-md border border-border bg-background px-3" defaultValue={(Number(order.amount_minor) / 100).toFixed(2)} inputMode="decimal" name="netAmount" required /></label><label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">Дата оплаты</span><input className="h-9 rounded-md border border-border bg-background px-3" defaultValue={new Date().toISOString().slice(0, 16)} name="paidAt" type="datetime-local" required /></label><label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">Причина ручной сверки</span><input className="h-9 rounded-md border border-border bg-background px-3" maxLength={500} minLength={3} name="reason" required /></label></AdminConfirmedForm></details>;
}
