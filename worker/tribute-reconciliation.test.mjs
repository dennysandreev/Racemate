import assert from "node:assert/strict";
import test from "node:test";

import {
  findMatchingTributeTransaction,
  makeTributeReconciliationHash,
} from "./tribute-reconciliation.mjs";

const order = Object.freeze({
  amount_minor: 24_900,
  created_at: "2026-09-19T12:00:00.000Z",
  currency: "RUB",
  provider_order_id: "550e8400-e29b-41d4-a716-446655440000",
});

const transaction = Object.freeze({
  amount: 24_900,
  createdAt: 1_789_819_260,
  currency: "rub",
  id: 12345,
  isRefunded: false,
  serviceFee: 2_490,
  shopOrder: { uuid: order.provider_order_id },
  total: 22_410,
  type: "shop_order_sell",
});

test("matches a paid Tribute shop transaction by order, amount and time", () => {
  assert.deepEqual(
    findMatchingTributeTransaction(order, { transactions: [transaction] }),
    {
      grossAmountMinor: 24_900,
      netAmountMinor: 22_410,
      occurredAt: "2026-09-19T12:01:00.000Z",
      transactionId: "12345",
    },
  );
});

test("rejects Tribute transactions that cannot prove the order", () => {
  const match = (overrides) => findMatchingTributeTransaction(order, {
    transactions: [{ ...transaction, ...overrides }],
  });

  assert.equal(match({ amount: 24_800 }), null);
  assert.equal(match({ currency: "usd" }), null);
  assert.equal(match({ isRefunded: true }), null);
  assert.equal(match({ shopOrder: { uuid: "another-order" } }), null);
  assert.equal(match({ total: 22_409 }), null);
  assert.equal(match({ type: "shop_order_buy" }), null);
  assert.equal(match({ createdAt: "2026-09-19T11:00:00.000Z" }), null);
});

test("uses a stable non-secret Tribute reconciliation hash", () => {
  const input = {
    grossAmountMinor: 24_900,
    netAmountMinor: 22_410,
    occurredAt: "2026-09-19T12:01:00.000Z",
    orderId: order.provider_order_id,
    transactionId: "12345",
  };
  const first = makeTributeReconciliationHash(input);
  const second = makeTributeReconciliationHash(input);

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
});
