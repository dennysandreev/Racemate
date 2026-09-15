import Link from "next/link";
import { CalendarClock, Check, ReceiptText } from "lucide-react";

import { AppShell as BaseAppShell } from "@/components/racemate/app-shell";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getSubscriptionAccess } from "@/lib/billing/access";
import { formatMoney, formatProvider } from "@/lib/billing/catalog";
import { getUserOrders } from "@/lib/billing/repository";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const user = await requireUser();
  const [access, orders] = await Promise.all([getSubscriptionAccess(user.id), getUserOrders(user.id)]);
  return <AppShell><section className="grid gap-5 py-4"><div className="stitch-panel relative overflow-hidden p-6 sm:p-8"><div aria-hidden className="absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_right,rgb(225_6_0_/.22),transparent_70%)]" /><p className="font-telemetry text-xs font-bold uppercase tracking-[0.14em] text-primary">RaceSide Plus</p><h1 className="mt-3 font-display text-4xl font-black">{access.active ? "Подписка активна" : "Больше данных о гонке"}</h1><p className="mt-3 max-w-xl leading-7 text-muted-foreground">{access.active && access.periodEnd ? `Доступ открыт до ${formatDate(access.periodEnd)}. Автопродления нет.` : "Откройте LIVE, полную телеметрию и Telegram-уведомления без рекламы."}</p><Button asChild className="mt-6"><Link href={access.active ? "/live" : "/plus#plans"}>{access.active ? "Открыть LIVE" : "Выбрать подписку"}</Link></Button></div><div className="stitch-panel overflow-hidden p-0"><div className="flex items-center gap-3 border-b stitch-divider p-5"><ReceiptText className="size-5 text-primary" /><div><h2 className="font-display text-lg font-bold">История платежей</h2><p className="text-sm text-muted-foreground">Все попытки оплаты этого аккаунта</p></div></div>{orders.length ? <div className="divide-y divide-border">{orders.map((order) => <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={order.id}><div><p className="font-semibold">{order.priceCode === "plus_first_year" ? "Первый год Plus" : "Месяц Plus"}</p><p className="mt-1 text-xs text-muted-foreground">{order.orderNumber} · {formatProvider(order.paymentMethod)}</p></div><span className="font-display text-lg font-bold">{formatMoney(order.amountMinor)}</span><Status status={order.status} /></div>)}</div> : <div className="grid min-h-44 place-items-center p-6 text-center text-sm text-muted-foreground"><div><CalendarClock className="mx-auto mb-3 size-7" /><p>Платежей пока нет.</p></div></div>}</div></section></AppShell>;
}

function Status({ status }: { status: string }) { const paid = status === "paid"; return <span className={paid ? "inline-flex items-center gap-1 rounded-full bg-[var(--success)]/10 px-2.5 py-1 text-xs font-bold text-[var(--success)]" : "inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-muted-foreground"}>{paid ? <Check className="size-3" /> : null}{paid ? "Оплачен" : status === "failed" ? "Не оплачен" : status === "refunded" ? "Возврат" : status === "partially_refunded" ? "Частичный возврат" : "Ожидает"}</span>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "Europe/Moscow" }).format(new Date(value)); }
function AppShell({ children }: { children: React.ReactNode }) { return <BaseAppShell hideAds>{children}</BaseAppShell>; }
