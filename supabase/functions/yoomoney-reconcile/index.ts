type BillingOrder = {
  id: string;
  provider_label: string;
  payment_method: "yoomoney_card" | "yoomoney_wallet";
  amount_minor: number;
  currency: "RUB";
  created_at: string;
};

type YooMoneyOperation = {
  operation_id?: unknown;
  status?: unknown;
  direction?: unknown;
  type?: unknown;
  amount?: unknown;
  datetime?: unknown;
  label?: unknown;
};

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const ALLOWED_INCOMING_TYPES = new Set(["deposit", "deposition", "incoming-transfer"]);
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_ORDERS = 100;

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const reconcileSecret = Deno.env.get("YOOMONEY_RECONCILE_SECRET")?.trim();
    if (
      !reconcileSecret
      || request.headers.get("x-raceside-reconcile-secret") !== reconcileSecret
    ) {
      return json({ error: "unauthorized" }, 401);
    }
    const accessToken = Deno.env.get("YOOMONEY_ACCESS_TOKEN")?.trim();
    if (!accessToken) return json({ error: "access_token_not_configured" }, 503);

    const body = await request.json();
    const orders = normalizeOrders(body?.orders);
    if (orders.length === 0) return json({ checked: 0, matches: [] });

    const oldestOrderMs = Math.min(...orders.map((order) => Date.parse(order.created_at)));
    const response = await fetch("https://yoomoney.ru/api/operation-history", {
      body: new URLSearchParams({
        details: "false",
        from: new Date(oldestOrderMs - MAX_CLOCK_SKEW_MS).toISOString(),
        records: "100",
        type: "deposition",
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "RaceSide-Billing/1.0",
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return json({ error: `history_http_${response.status}` }, 502);

    const payload = await response.json();
    if (payload?.error) {
      return json({ error: `history_${String(payload.error).slice(0, 80)}` }, 502);
    }
    const operations: YooMoneyOperation[] = Array.isArray(payload?.operations)
      ? payload.operations
      : [];
    const matches = [];
    for (const order of orders) {
      const operation = operations.find((candidate) => matchesOrder(order, candidate));
      if (operation) {
        matches.push({
          orderId: order.id,
          operation: {
            amount: operation.amount,
            datetime: operation.datetime,
            direction: operation.direction,
            label: operation.label,
            operation_id: operation.operation_id,
            status: operation.status,
            type: operation.type,
          },
        });
      }
    }

    return json({ checked: orders.length, matches });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "history_timeout"
      : "unexpected_error";
    return json({ error: message }, 502);
  }
});

function normalizeOrders(value: unknown): BillingOrder[] {
  if (!Array.isArray(value)) return [];
  const orders = [];
  for (const candidate of value.slice(0, MAX_ORDERS)) {
    if (!candidate || typeof candidate !== "object") continue;
    const order = candidate as Record<string, unknown>;
    if (typeof order.id !== "string" || typeof order.provider_label !== "string") continue;
    if (order.currency !== "RUB") continue;
    if (order.payment_method !== "yoomoney_card" && order.payment_method !== "yoomoney_wallet") continue;
    if (typeof order.amount_minor !== "number" || !Number.isSafeInteger(order.amount_minor) || order.amount_minor <= 0) continue;
    if (typeof order.created_at !== "string" || !Number.isFinite(Date.parse(order.created_at))) continue;
    orders.push(order as BillingOrder);
  }
  return orders;
}

function matchesOrder(order: BillingOrder, operation: YooMoneyOperation) {
  if (!operation || typeof operation !== "object") return false;
  if (operation.label !== order.provider_label) return false;
  if (operation.status !== "success" || operation.direction !== "in") return false;
  if (typeof operation.type !== "string" || !ALLOWED_INCOMING_TYPES.has(operation.type)) return false;
  if (parseAmountMinor(operation.amount) !== expectedNetAmountMinor(order)) return false;
  const occurredAtMs = typeof operation.datetime === "string" ? Date.parse(operation.datetime) : Number.NaN;
  if (!Number.isFinite(occurredAtMs)) return false;
  if (occurredAtMs < Date.parse(order.created_at) - MAX_CLOCK_SKEW_MS) return false;
  return typeof operation.operation_id === "string"
    && /^[A-Za-z0-9._:-]{3,160}$/.test(operation.operation_id.trim());
}

function expectedNetAmountMinor(order: BillingOrder) {
  return order.payment_method === "yoomoney_card"
    ? Math.round((order.amount_minor * 97) / 100)
    : Math.round((order.amount_minor * 100) / 101);
}

function parseAmountMinor(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    status,
  });
}
