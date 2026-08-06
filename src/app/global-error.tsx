"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
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
    <html lang="ru" data-theme="dark">
      <body className="grid min-h-[100dvh] place-items-center bg-background px-4 py-8 text-foreground">
        <main className="stitch-panel relative w-full max-w-2xl overflow-hidden p-6 text-center sm:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(225_6_0_/_0.24),transparent_22rem)]" />
          <div className="relative">
            <h1 className="text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
              RaceSide не загрузился
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
              Попробуйте открыть страницу ещё раз. Если ошибка повторится, вернитесь чуть позже.
            </p>
            <div className="mt-7 flex justify-center">
              <Button onClick={reset}>Попробовать ещё раз</Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
