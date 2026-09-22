import { TelemetryHub } from "@/features/telemetry/components/telemetry-hub";
import { SubscriptionGateContent } from "@/components/racemate/subscription-gate";
import { getSessionUser } from "@/lib/auth";
import { getSubscriptionAccess } from "@/lib/billing/access";
import { billingFlags } from "@/lib/billing/config";
import { createPageMetadata } from "@/lib/seo";
import { getTelemetryBootstrap } from "@/features/telemetry/lib/server";
import { getTelemetryDemoScope } from "@/features/telemetry/lib/demo-access";
export const metadata = createPageMetadata({
  title: "Телеметрия Формулы-1",
  description:
    "Сравнение кругов, скорости, торможений и траекторий пилотов. Узнайте, на каких участках было выиграно время.",
  path: "/telemetry",
});
export default async function TelemetryPage() {
  const user = await getSessionUser();
  if (!user && billingFlags.entitlementsEnforced) return <SubscriptionGateContent description="Войдите, чтобы бесплатно посмотреть телеметрию одного демо-этапа. Все остальные Гран-при доступны с RaceSide Plus." signedIn={false} title="Телеметрия начинается со входа" />;
  const access = await getSubscriptionAccess(user?.id ?? null);
  const demoMode = !access.entitlements.telemetry_full;
  const demoScope = demoMode ? await getTelemetryDemoScope() : null;
  const initialBootstrap =
    demoMode && !demoScope
      ? undefined
      : await getTelemetryBootstrap({ demoScope, waitMs: 0 });
  return (
    <TelemetryHub
      demoMode={demoMode}
      initialBootstrap={initialBootstrap}
    />
  );
}
