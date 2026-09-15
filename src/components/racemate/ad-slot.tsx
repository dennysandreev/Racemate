import { getSessionUser } from "@/lib/auth";
import { getSubscriptionAccess } from "@/lib/billing/access";
import { billingFlags } from "@/lib/billing/config";

export async function AdSlot() {
  if (!billingFlags.ads) return null;
  const user = await getSessionUser();
  const access = await getSubscriptionAccess(user?.id ?? null);
  if (access.entitlements.ads_disabled) return null;
  return <aside aria-label="Реклама" className="mx-auto mb-6 mt-2 w-full max-w-5xl rounded-lg border border-border bg-card px-5 py-4 text-center"><p className="font-telemetry text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Реклама</p><div className="mt-2 min-h-12 text-sm text-muted-foreground">Место для партнёрского материала</div></aside>;
}
