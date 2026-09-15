"use client";
import Link from "next/link";
export default function LiveError({ reset }: { reset: () => void }) {
  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center gap-5 bg-background text-foreground">
      <Link
        href="/weekend"
        className="absolute top-4 left-4"
        aria-label="Вернуться на текущий этап"
      >
        ← Вернуться
      </Link>
      <h1>Не удалось открыть LIVE</h1>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Попробовать ещё раз
      </button>
    </main>
  );
}
