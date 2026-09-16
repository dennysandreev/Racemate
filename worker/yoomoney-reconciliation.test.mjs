import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedYooMoneyNetAmountMinor,
  findMatchingYooMoneyOperation,
  makeYooMoneyReconciliationHash,
} from "./yoomoney-reconciliation.mjs";

const order = Object.freeze({
  amount_minor: 24_900,
  created_at: "2026-09-15T22:01:53.718Z",
  currency: "RUB",
  payment_method: "yoomoney_card",
  provider_label: "rs_1234567890abcdef",
});

test("calculates the documented YooMoney net amount", () => {
  assert.equal(expectedYooMoneyNetAmountMinor(24_900, "yoomoney_card"), 24_153);
  assert.equal(expectedYooMoneyNetAmountMinor(24_900, "yoomoney_wallet"), 24_653);
});

test("matches a successful incoming operation by label, amount and time", () => {
  const operation = findMatchingYooMoneyOperation(order, [
    {
      amount: 241.53,
      datetime: "2026-09-15T22:02:00.000Z",
      direction: "in",
      label: "rs_1234567890abcdef",
      operation_id: "842824956756395120",
      status: "success",
      type: "deposition",
    },
  ]);

  assert.deepEqual(operation, {
    netAmountMinor: 24_153,
    occurredAt: "2026-09-15T22:02:00.000Z",
    operationId: "842824956756395120",
  });
});

test("rejects operations that cannot prove the order", () => {
  const base = {
    amount: 241.53,
    datetime: "2026-09-15T22:02:00.000Z",
    direction: "in",
    label: "rs_1234567890abcdef",
    operation_id: "842824956756395120",
    status: "success",
    type: "deposition",
  };

  assert.equal(findMatchingYooMoneyOperation(order, [{ ...base, label: "rs_other" }]), null);
  assert.equal(findMatchingYooMoneyOperation(order, [{ ...base, amount: 240 }]), null);
  assert.equal(findMatchingYooMoneyOperation(order, [{ ...base, direction: "out" }]), null);
  assert.equal(findMatchingYooMoneyOperation(order, [{ ...base, status: "in_progress" }]), null);
  assert.equal(findMatchingYooMoneyOperation(order, [{ ...base, datetime: "2026-09-15T21:30:00.000Z" }]), null);
});

test("uses a stable non-secret payload hash", () => {
  const first = makeYooMoneyReconciliationHash({
    amountMinor: 24_153,
    label: "rs_1234567890abcdef",
    occurredAt: "2026-09-15T22:02:00.000Z",
    operationId: "842824956756395120",
  });
  const second = makeYooMoneyReconciliationHash({
    amountMinor: 24_153,
    label: "rs_1234567890abcdef",
    occurredAt: "2026-09-15T22:02:00.000Z",
    operationId: "842824956756395120",
  });

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
});
