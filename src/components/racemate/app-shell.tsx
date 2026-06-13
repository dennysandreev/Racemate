import Link from "next/link";
import { ArrowRight, Flag, LogOut, Menu } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { MainNavigation } from "@/components/racemate/main-navigation";
import { Button } from "@/components/ui/button";
import { getIsAdmin, getSessionUser } from "@/lib/auth";

const navigation = [
  { href: "/news", label: "Новости" },
  { href: "/leaderboard", label: "Чемпионат" },
  { href: "/calendar", label: "Календарь" },
  { href: "/weekend", label: "Текущий этап" },
  { href: "/fantasy", label: "Фентази лига" },
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

        <details className="group relative lg:hidden">
          <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-border/70 bg-background/65 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Открыть меню</span>
            <Menu aria-hidden="true" className="size-5" />
          </summary>
          <div className="absolute right-0 top-12 z-40 grid w-[min(18rem,calc(100vw-2rem))] gap-2 rounded-lg border border-border bg-card p-2 shadow-2xl">
            {visibleNavigation.map((item) => (
              <Link
                className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-1 border-t border-border/70 pt-2">
              {user ? (
                <form action={signOut}>
                  <Button className="w-full justify-center" size="sm" type="submit" variant="secondary">
                    Выйти
                    <LogOut aria-hidden="true" data-icon="inline-end" />
                  </Button>
                </form>
              ) : (
                <Button asChild className="w-full justify-center" size="sm">
                  <Link href="/auth">
                    Войти
                    <ArrowRight aria-hidden="true" data-icon="inline-end" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </details>

        {user ? (
          <form action={signOut} className="hidden lg:block">
            <Button size="sm" type="submit" variant="secondary">
              Выйти
              <LogOut aria-hidden="true" data-icon="inline-end" />
            </Button>
          </form>
        ) : (
          <Button asChild className="hidden lg:inline-flex" size="sm">
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
