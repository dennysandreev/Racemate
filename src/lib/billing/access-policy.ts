import type { Entitlement, SubscriptionAccess } from "@/lib/billing/types";

const EMPTY_ENTITLEMENTS: Record<Entitlement, boolean> = {
  ads_disabled: false,
  live: false,
  telegram_notifications: false,
  telemetry_demo: false,
  telemetry_full: false,
};

export function buildSubscriptionAccess(input: {
  enforced: boolean;
  now: string;
  periods: Array<{ ends_at: string; starts_at: string; status: string }>;
  planEntitlements: string[];
  subscription: {
    current_period_end: string | null;
    current_period_start: string | null;
    status: string;
  } | null;
  userId: string | null;
}): SubscriptionAccess {
  const entitlements = {
    ...EMPTY_ENTITLEMENTS,
    telemetry_demo: Boolean(input.userId),
  };
  const now = Date.parse(input.now);
  const hasActivePeriod = input.periods.some((period) => {
    const startsAt = Date.parse(period.starts_at);
    const endsAt = Date.parse(period.ends_at);
    return period.status === "active" && startsAt <= now && endsAt > now;
  });
  const active = input.subscription?.status === "active" && hasActivePeriod;

  if (active) {
    for (const entitlement of input.planEntitlements) {
      if (entitlement in entitlements) {
        entitlements[entitlement as Entitlement] = true;
      }
    }
  }

  const effectiveActive = active || !input.enforced;
  return {
    active,
    effectiveActive,
    entitlements: effectiveActive
      ? enableProductEntitlements(entitlements)
      : entitlements,
    periodEnd: input.subscription?.current_period_end ?? null,
    periodStart: input.subscription?.current_period_start ?? null,
    status: !input.userId
      ? "guest"
      : active
        ? "active"
        : input.subscription?.status === "revoked"
          ? "revoked"
          : "expired",
    userId: input.userId,
  };
}

function enableProductEntitlements(
  current: Record<Entitlement, boolean>,
): Record<Entitlement, boolean> {
  return {
    ...current,
    ads_disabled: true,
    live: true,
    telegram_notifications: true,
    telemetry_full: true,
  };
}
