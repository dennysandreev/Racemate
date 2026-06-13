import Link from "next/link";
import { ArrowRight, Flag, LogOut } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { MainNavigation } from "@/components/racemate/main-navigation";
import { Button } from "@/components/ui/button";
import { getIsAdmin, getSessionUser } from "@/lib/auth";

const navigation = [
  { href: "/news", label: "Новости" },
  { href: "/leaderboard", label: "Чемпионат" },
  { href: "/calendar", label: "Календарь" },
  { href: "/weekend", label: "Текущий этап" },
  { href: "/predictions", label: "Прогнозы" },
  { href: "/leagues", label: "Лиги" },
  { href: "/polls", label: "Опросы" },
  { href: "/admin", label: "Админка" },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [user, isAdmin] = await Promise.all([getSessionUser(), getIsAdmin()]);
  const visibleNavigation = navigation.filter((item) => item.href !== "/admin" || isAdmin);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-4 border-b border-border/70 py-3">
        <Link
          className="group flex items-center gap-3 rounded-full pr-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_oklch(0.62_0.22_27_/_0.35)] transition-transform group-hover:scale-105 sm:size-11">
            <Flag aria-hidden="true" data-icon="inline-start" />
          </span>
          <span className="flex items-baseline leading-none">
            <span className="text-xl font-semibold tracking-normal sm:text-2xl lg:text-[1.65rem]">
              RaceMate
            </span>
          </span>
        </Link>

        <MainNavigation items={visibleNavigation} />

        {user ? (
          <form action={signOut}>
            <Button size="sm" type="submit" variant="secondary">
              Выйти
              <LogOut aria-hidden="true" data-icon="inline-end" />
            </Button>
          </form>
        ) : (
          <Button asChild size="sm">
            <Link href="/auth">
              Войти
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>
        )}
      </header>

      {children}
    </main>
  );
}
