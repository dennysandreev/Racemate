import { LiveTerminal } from "@/features/live/components/live-terminal";
import { SubscriptionGate } from "@/components/racemate/subscription-gate";
import { getSessionUser } from "@/lib/auth";
import { getSubscriptionAccess } from "@/lib/billing/access";
import { createPageMetadata } from "@/lib/seo";
export const metadata = createPageMetadata({
  title: "RaceSide LIVE",
  description: "Тайминг, трасса, телеметрия и радио Формулы-1 в прямом эфире.",
  path: "/live",
  noIndex: true,
});
export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { returnUrl } = await searchParams;
  const user = await getSessionUser();
  const access = await getSubscriptionAccess(user?.id ?? null);
  if (!access.entitlements.live) {
    return <SubscriptionGate description="Тайминг, положение машин, интервалы и радио во время гоночного уикенда доступны с RaceSide Plus." signedIn={Boolean(user)} title="LIVE открывается по подписке" />;
  }
  const safe =
    returnUrl &&
    /^\/(weekend|calendar(?:\/[0-9]+\/[0-9]+)?)(?:\?[^\\\r\n]*)?$/.test(
      returnUrl,
    )
      ? returnUrl
      : "/weekend";
  return <LiveTerminal returnUrl={safe} />;
}
