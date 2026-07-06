import Link from "next/link";

import { AppShell } from "@/components/racemate/app-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <AppShell>
      <section className="grid min-h-[58dvh] place-items-center py-8">
        <div className="stitch-panel relative w-full max-w-3xl overflow-hidden p-5 text-center sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(225_6_0_/_0.24),transparent_22rem)]" />
          <div className="relative">
            <p className="font-telemetry text-xs font-bold uppercase tracking-[0.16em] text-primary">
              404
            </p>
            <h1 className="mt-3 font-display text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
              Страница не найдена
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Похоже, этот поворот не вошел в календарь RaceMate. Вернитесь на главную страницу или откройте календарь ближайших этапов.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/" prefetch={false}>На главную</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/calendar" prefetch={false}>Календарь</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
