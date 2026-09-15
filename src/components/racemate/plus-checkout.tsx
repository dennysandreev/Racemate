"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Bitcoin, Check, LoaderCircle, LogIn, X } from "lucide-react";

import {
  cancelCheckout,
  startCheckout,
  type CancelCheckoutState,
  type CheckoutState,
} from "@/app/plus/actions";
import { Button } from "@/components/ui/button";
import type {
  BillingPaymentMethod,
  BillingPriceCode,
} from "@/lib/billing/types";
import { cn } from "@/lib/utils";

const initialState: CheckoutState = {};
const initialCancelState: CancelCheckoutState = {};

export type CheckoutPaymentOption =
  | "russian_card"
  | "international_card"
  | "crypto";

export function PlusCheckout({
  activeSubscription,
  firstYearAvailable,
  initialPaymentOption,
  initialPriceCode,
  pendingOrder,
  signedIn,
  tribute,
  yoomoney,
}: {
  activeSubscription: boolean;
  firstYearAvailable: boolean;
  initialPaymentOption?: CheckoutPaymentOption;
  initialPriceCode?: BillingPriceCode;
  pendingOrder: { orderNumber: string } | null;
  signedIn: boolean;
  tribute: boolean;
  yoomoney: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(startCheckout, initialState);
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelCheckout,
    initialCancelState,
  );
  const [priceCode, setPriceCode] = useState<BillingPriceCode | undefined>(
    () => {
      if (initialPriceCode === "plus_first_year" && firstYearAvailable) {
        return initialPriceCode;
      }
      if (initialPriceCode === "plus_monthly") return initialPriceCode;
      return undefined;
    },
  );
  const [paymentOption, setPaymentOption] = useState<
    CheckoutPaymentOption | undefined
  >(() =>
    resolvePaymentOption({
      initialPaymentOption,
      tribute,
      yoomoney,
    }),
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const checkout = state.checkout;
    if (!checkout) return;
    if (checkout.kind === "redirect") {
      window.location.assign(checkout.url);
      return;
    }
    const form = document.createElement("form");
    form.action = checkout.action;
    form.method = "POST";
    for (const [name, value] of Object.entries(checkout.fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
  }, [state.checkout]);

  useEffect(() => {
    if (cancelState.cancelled || cancelState.paid) router.refresh();
  }, [cancelState.cancelled, cancelState.paid, router]);

  const enabled = tribute || yoomoney;
  const paymentMethod = toBillingPaymentMethod(paymentOption);
  const readyToCheckout = Boolean(priceCode && paymentMethod && enabled);
  const authHref = useMemo(() => {
    if (!priceCode || !paymentOption) {
      return "/auth?next=%2Fplus%23checkout";
    }
    const next = `/plus?plan=${encodeURIComponent(priceCode)}&payment=${encodeURIComponent(paymentOption)}#checkout`;
    return `/auth?next=${encodeURIComponent(next)}`;
  }, [paymentOption, priceCode]);
  const ctaLabel = getCheckoutLabel({
    activeSubscription,
    paymentOption,
    pending,
    priceCode,
    signedIn,
  });

  if (pendingOrder) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-primary/35 bg-primary/8 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display font-bold">Проверяем предыдущую оплату</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Заказ {pendingOrder.orderNumber}. Доступ включится после
            подтверждения платёжного сервиса.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="shrink-0" size="sm" variant="secondary">
            <Link href={`/payment/confirmation/${pendingOrder.orderNumber}`}>
              Проверить статус
            </Link>
          </Button>
          <form action={cancelAction}>
            <input
              name="orderNumber"
              type="hidden"
              value={pendingOrder.orderNumber}
            />
            <Button
              className="w-full shrink-0 sm:w-auto"
              disabled={cancelling}
              size="sm"
              type="submit"
              variant="outline"
            >
              {cancelling ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <X aria-hidden="true" data-icon="inline-start" />
              )}
              {cancelling ? "Отменяем" : "Отменить"}
            </Button>
          </form>
          {cancelState.error ? (
            <p
              aria-live="polite"
              className="text-sm text-danger sm:self-center"
            >
              {cancelState.error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form action={signedIn ? action : undefined} className="grid gap-2.5">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      {paymentMethod ? (
        <input name="paymentMethod" type="hidden" value={paymentMethod} />
      ) : null}

      <fieldset>
        <legend className="mb-1.5 font-telemetry text-[0.58rem] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[0.62rem]">
          Срок подписки
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {firstYearAvailable ? (
            <Choice checked={priceCode === "plus_first_year"}>
              <span className="grid min-h-[5.25rem] grid-cols-1 content-between gap-1 sm:min-h-14 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                <span className="min-w-0">
                  <strong className="block whitespace-nowrap font-telemetry text-[0.68rem] font-black uppercase tracking-[0.04em] text-foreground sm:text-sm sm:tracking-[0.06em]">
                    Год
                  </strong>
                  <span className="mt-1 block text-[0.68rem] text-muted-foreground sm:text-xs">
                    12 месяцев
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-1 font-telemetry sm:block sm:text-right">
                  <strong className="block whitespace-nowrap text-base font-black text-foreground sm:text-xl">
                    1 990 ₽
                  </strong>
                  <span className="mt-0.5 block whitespace-nowrap text-[0.52rem] font-bold text-success sm:text-[0.68rem]">
                    ≈ 166 ₽/мес.
                  </span>
                </span>
              </span>
              <input
                checked={priceCode === "plus_first_year"}
                className="sr-only"
                name="priceCode"
                onChange={() => setPriceCode("plus_first_year")}
                type="radio"
                value="plus_first_year"
              />
            </Choice>
          ) : null}

          <Choice checked={priceCode === "plus_monthly"}>
            <span className="grid min-h-[5.25rem] grid-cols-1 content-between gap-1 sm:min-h-14 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
              <span className="min-w-0">
                <strong className="block whitespace-nowrap font-telemetry text-[0.68rem] font-black uppercase tracking-[0.04em] text-foreground sm:text-sm sm:tracking-[0.06em]">
                  Месяц
                </strong>
                <span className="mt-1 block text-[0.68rem] text-muted-foreground sm:text-xs">
                  Продлите сами
                </span>
              </span>
              <strong className="whitespace-nowrap font-telemetry text-base font-black text-foreground sm:text-right sm:text-xl">
                249 ₽
              </strong>
            </span>
            <input
              checked={priceCode === "plus_monthly"}
              className="sr-only"
              name="priceCode"
              onChange={() => setPriceCode("plus_monthly")}
              type="radio"
              value="plus_monthly"
            />
          </Choice>
        </div>
      </fieldset>

      <div
        aria-hidden={!priceCode}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          priceCode
            ? "grid-rows-[1fr] opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {enabled ? (
            <fieldset disabled={!priceCode}>
              <legend className="mb-1.5 font-telemetry text-[0.58rem] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[0.62rem]">
                Способ оплаты
              </legend>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {yoomoney ? (
                  <PaymentChoice
                    checked={paymentOption === "russian_card"}
                    icon={
                      <Image
                        alt=""
                        className="h-5 w-auto"
                        height={120}
                        src="/brand/payment-yoomoney.svg"
                        width={169}
                      />
                    }
                    label="Российская карта"
                    note="ЮMoney"
                    onChange={() => setPaymentOption("russian_card")}
                    value="russian_card"
                  />
                ) : null}
                {tribute ? (
                  <PaymentChoice
                    checked={paymentOption === "international_card"}
                    icon={
                      <Image
                        alt=""
                        className="size-6"
                        height={30}
                        src="/brand/payment-tribute.svg"
                        width={30}
                      />
                    }
                    label="Visa и Mastercard"
                    note="Tribute"
                    onChange={() => setPaymentOption("international_card")}
                    value="international_card"
                  />
                ) : null}
                {tribute ? (
                  <PaymentChoice
                    checked={paymentOption === "crypto"}
                    icon={
                      <Bitcoin
                        aria-hidden="true"
                        className="size-5 text-[#f7931a] sm:size-6"
                      />
                    }
                    label="USDT, TON"
                    note="Через Tribute"
                    onChange={() => setPaymentOption("crypto")}
                    value="crypto"
                  />
                ) : null}
              </div>
            </fieldset>
          ) : null}
        </div>
      </div>

      {state.error ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      {signedIn ? (
        <Button
          className="h-10 w-full px-5 sm:w-auto sm:min-w-64 sm:justify-self-end"
          disabled={!readyToCheckout || pending}
          size="sm"
          type="submit"
        >
          {pending ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : readyToCheckout ? (
            <Check aria-hidden="true" data-icon="inline-start" />
          ) : null}
          {ctaLabel}
        </Button>
      ) : readyToCheckout ? (
        <Button
          asChild
          className="h-10 w-full px-5 sm:w-auto sm:min-w-64 sm:justify-self-end"
          size="sm"
        >
          <Link href={authHref}>
            <LogIn aria-hidden="true" data-icon="inline-start" />
            {ctaLabel}
          </Link>
        </Button>
      ) : (
        <Button
          className="h-10 w-full px-5 sm:w-auto sm:min-w-64 sm:justify-self-end"
          disabled
          size="sm"
          type="button"
        >
          {ctaLabel}
        </Button>
      )}
    </form>
  );
}

function Choice({
  checked,
  children,
}: {
  checked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative min-w-0 cursor-pointer rounded-md border px-3 py-2 transition-[border-color,background-color,transform] duration-200 active:translate-y-px motion-reduce:transition-none",
        checked
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-foreground/25 hover:bg-accent/55",
      )}
    >
      {checked ? (
        <Check
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 size-5 rounded-full bg-primary p-1 text-primary-foreground"
        />
      ) : null}
      {children}
    </label>
  );
}

function PaymentChoice({
  checked,
  icon,
  label,
  note,
  onChange,
  value,
}: {
  checked: boolean;
  icon: React.ReactNode;
  label: string;
  note: string;
  onChange: () => void;
  value: CheckoutPaymentOption;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[4.5rem] min-w-0 cursor-pointer flex-col items-start justify-center gap-1.5 rounded-md border p-2 transition-[border-color,background-color,transform] duration-200 active:translate-y-px motion-reduce:transition-none sm:min-h-14 sm:flex-row sm:items-center sm:gap-3 sm:p-3",
        checked
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-foreground/25 hover:bg-accent/55",
      )}
    >
      <input
        checked={checked}
        className="sr-only"
        name="paymentOption"
        onChange={onChange}
        type="radio"
        value={value}
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-sm bg-accent/80",
          checked && "bg-primary/10",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <strong className="block text-[0.65rem] leading-tight text-foreground sm:text-sm">
          {label}
        </strong>
        <span className="mt-0.5 block text-[0.58rem] leading-tight text-muted-foreground sm:text-xs">
          {note}
        </span>
      </span>
    </label>
  );
}

function resolvePaymentOption({
  initialPaymentOption,
  tribute,
  yoomoney,
}: {
  initialPaymentOption?: CheckoutPaymentOption;
  tribute: boolean;
  yoomoney: boolean;
}): CheckoutPaymentOption | undefined {
  if (initialPaymentOption === "russian_card" && yoomoney) {
    return initialPaymentOption;
  }
  if (
    (initialPaymentOption === "international_card" ||
      initialPaymentOption === "crypto") &&
    tribute
  ) {
    return initialPaymentOption;
  }
  return undefined;
}

function toBillingPaymentMethod(
  option?: CheckoutPaymentOption,
): BillingPaymentMethod | undefined {
  if (option === "russian_card") return "yoomoney_card";
  if (option === "international_card" || option === "crypto") {
    return "tribute";
  }
  return undefined;
}

function getCheckoutLabel({
  activeSubscription,
  paymentOption,
  pending,
  priceCode,
  signedIn,
}: {
  activeSubscription: boolean;
  paymentOption?: CheckoutPaymentOption;
  pending: boolean;
  priceCode?: BillingPriceCode;
  signedIn: boolean;
}) {
  if (pending) return "Открываем оплату…";
  if (!priceCode) return "Сначала выберите срок";
  if (!paymentOption) return "Выберите способ оплаты";
  if (!signedIn) return "Войти и оформить";
  return activeSubscription ? "Продлить Plus" : "Перейти к оплате";
}
