import Link from "next/link";
import { Clock3, XCircle } from "lucide-react";

import { AppShell as BaseAppShell } from "@/components/racemate/app-shell";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getUserOrder } from "@/lib/billing/repository";
import { createPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({ title: "Проверяем оплату", description: "Статус оплаты RaceSide Plus.", path: "/payment/return", noIndex: true });

export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ order?: string; status?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const order = params.order && /^RS-\d{4}-[A-F0-9]{12}$/.test(params.order) ? await getUserOrder(user.id, params.order) : null;
  const failed = params.status === "failed" || order?.status === "failed";
  if (order?.status === "paid") return <AppShell><StatusCard icon="success" title="Plus уже активен" text="Оплата подтверждена. LIVE, полная телеметрия и Telegram-уведомления доступны." actionHref="/account/subscription" action="Открыть подписку" /></AppShell>;
  return <AppShell><StatusCard icon={failed ? "failed" : "pending"} title={failed ? "Оплата не завершена" : "Ждём подтверждение"} text={failed ? "Деньги не списаны. Можно вернуться и выбрать тот же или другой способ оплаты." : "Обычно это занимает несколько секунд. Страница подписки покажет актуальный статус."} actionHref={failed ? "/plus#plans" : order ? `/payment/confirmation/${order.orderNumber}` : "/account/subscription"} action={failed ? "Попробовать снова" : "Проверить статус"} /></AppShell>;
}

function StatusCard({ action, actionHref, icon, text, title }: { action: string; actionHref: string; icon: "failed" | "pending" | "success"; text: string; title: string }) {
  const Icon = icon === "failed" ? XCircle : Clock3;
  return <section className="mx-auto grid min-h-[65vh] max-w-2xl place-items-center"><div className="stitch-panel w-full p-7 text-center sm:p-10"><Icon className={icon === "failed" ? "mx-auto size-12 text-danger" : icon === "success" ? "mx-auto size-12 text-[var(--success)]" : "mx-auto size-12 text-primary"} /><h1 className="mt-5 font-display text-3xl font-black">{title}</h1><p className="mx-auto mt-3 max-w-lg leading-7 text-muted-foreground">{text}</p><Button asChild className="mt-7"><Link href={actionHref}>{action}</Link></Button></div></section>;
}

function AppShell({ children }: { children: React.ReactNode }) { return <BaseAppShell hideAds>{children}</BaseAppShell>; }
