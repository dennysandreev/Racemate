import "server-only";

import { cache } from "react";

import { buildSubscriptionAccess } from "@/lib/billing/access-policy";
import { billingFlags } from "@/lib/billing/config";
import type { Entitlement, SubscriptionAccess } from "@/lib/billing/types";
import {
  invalidateServerTtlCache,
  withServerTtlCache,
} from "@/lib/server-ttl-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const ACCESS_TTL_MS = 5_000;

export const getSubscriptionAccess = cache(async (userId: string | null): Promise<SubscriptionAccess> => {
  if (!userId) {
    return buildSubscriptionAccess({
      enforced: billingFlags.entitlementsEnforced,
      now: new Date().toISOString(),
      periods: [],
      planEntitlements: [],
      subscription: null,
      userId: null,
    });
  }

  return withServerTtlCache(
    accessCacheKey(userId),
    ACCESS_TTL_MS,
    () => loadSubscriptionAccess(userId),
  );
});

async function loadSubscriptionAccess(userId: string): Promise<SubscriptionAccess> {
  const now = new Date().toISOString();

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return buildSubscriptionAccess({
      enforced: billingFlags.entitlementsEnforced,
      now,
      periods: [],
      planEntitlements: [],
      subscription: null,
      userId,
    });
  }

  const { data } = await admin
    .from("subscriptions")
    .select("id, status, current_period_start, current_period_end, plan_id")
    .eq("user_id", userId)
    .maybeSingle();
  const [{ data: periods }, { data: plan }] = await Promise.all([
    data?.id
      ? admin
          .from("subscription_periods")
          .select("starts_at, ends_at, status")
          .eq("subscription_id", data.id)
          .eq("status", "active")
          .lte("starts_at", now)
          .gt("ends_at", now)
      : Promise.resolve({ data: [] }),
    data?.plan_id
      ? admin
          .from("subscription_plans")
          .select("entitlements")
          .eq("id", data.plan_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return buildSubscriptionAccess({
    enforced: billingFlags.entitlementsEnforced,
    now,
    periods: periods ?? [],
    planEntitlements: plan?.entitlements ?? [],
    subscription: data
      ? {
          current_period_end: data.current_period_end,
          current_period_start: data.current_period_start,
          status: data.status,
        }
      : null,
    userId,
  });
}

export function canUse(access: SubscriptionAccess, entitlement: Entitlement) {
  return access.entitlements[entitlement];
}

export async function requireEntitlement(userId: string, entitlement: Entitlement) {
  const access = await getSubscriptionAccess(userId);
  if (!canUse(access, entitlement)) throw new EntitlementRequiredError(entitlement);
  return access;
}

export function invalidateSubscriptionAccess(userId: string) {
  invalidateServerTtlCache(accessCacheKey(userId));
}

export class EntitlementRequiredError extends Error {
  constructor(readonly entitlement: Entitlement) {
    super("SUBSCRIPTION_REQUIRED");
    this.name = "EntitlementRequiredError";
  }
}

function accessCacheKey(userId: string) {
  return `auth:subscription-access:${userId}`;
}
