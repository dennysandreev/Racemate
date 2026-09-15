import type { BillingOrder } from "@/lib/billing/types";

export function isOpenPendingCheckout(
  order: Pick<BillingOrder, "expiresAt" | "status">,
  now = Date.now(),
) {
  const expiresAt = Date.parse(order.expiresAt);
  return (
    order.status === "pending" && Number.isFinite(expiresAt) && expiresAt > now
  );
}
