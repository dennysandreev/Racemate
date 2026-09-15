import { notFound } from "next/navigation";
import { cache } from "react";
import { readSaved, present, telemetryStore } from "@/features/telemetry/lib/server";
import { TelemetryHub } from "@/features/telemetry/components/telemetry-hub";
import { createPageMetadata } from "@/lib/seo";
import type { Meeting } from "@/features/telemetry/lib/types";
import { getSessionUser } from "@/lib/auth";
import { getSubscriptionAccess } from "@/lib/billing/access";
import { configUsesDemoSessions, getTelemetryDemoScope } from "@/features/telemetry/lib/demo-access";
import { SubscriptionGateContent } from "@/components/racemate/subscription-gate";
import { billingFlags } from "@/lib/billing/config";
const getSaved = cache(readSaved);
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saved = await getSaved(id);
  return createPageMetadata({
    title: saved
      ? `${saved.comparison.traces.map((t) => t.driver.code).join(" / ")} — ${saved.comparison.track.name}`
      : "Сравнение телеметрии",
    description:
      "Где было выиграно время: сравнение кругов, графики и карта трассы RaceSide.",
    path: `/telemetry/compare/${id}`,
    image: saved ? `/api/share-image/telemetry/${id}` : undefined,
    noIndex: true,
  });
}
export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saved = await getSaved(id);
  if (!saved) notFound();
  const user = await getSessionUser();
  if (!user && billingFlags.entitlementsEnforced) return <SubscriptionGateContent description="Войдите, чтобы открыть демо телеметрии." signedIn={false} title="Телеметрия начинается со входа" />;
  const access = await getSubscriptionAccess(user?.id ?? null);
  if (!access.entitlements.telemetry_full) {
    const demo = await getTelemetryDemoScope();
    if (!demo || !configUsesDemoSessions(saved.comparison.config, demo)) return <SubscriptionGateContent description="Сохранённые сравнения доступны с RaceSide Plus." signedIn title="Откройте полную телеметрию" />;
  }
  const session = saved.comparison.traces[0].session;
  const meetings = await telemetryStore().get<Meeting[]>(`meetings:${session.season}`).catch(() => null);
  const meetingName = meetings?.find((meeting) => meeting.id === session.meetingId)?.name;
  return (
    <TelemetryHub demoMode={!access.entitlements.telemetry_full} initialMeetingName={meetingName} saved={{ ...saved, comparison: present(saved.comparison) }} />
  );
}
