"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function DriversError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-20">
      <section className="stitch-panel relative w-full max-w-2xl overflow-hidden p-6 text-center sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(225_6_0_/_0.2),transparent_22rem)]" />
        <div className="relative">
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
            Не удалось загрузить пилотов
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            Составы и результаты не изменились. Попробуй открыть раздел еще раз.
          </p>
          <Button className="mt-6" onClick={reset}>Попробовать еще раз</Button>
        </div>
      </section>
    </main>
  );
}
