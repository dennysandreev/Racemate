import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Flag,
  LogOut,
  Menu,
  Newspaper,
  Radio,
  Trophy,
  Users,
  UserRound,
  Vote,
} from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { getNextSession } from "@/data/racemate-repository";
import { getIsAdmin, getSessionProfileSummary } from "@/lib/auth";
import { formatSessionCountdown, formatSessionName } from "@/lib/session-display";

const navigation = [
  { href: "/news", label: "Новости", icon: Newspaper },
  { href: "/social", label: "Соцсети", icon: Radio },
  { href: "/leaderboard", label: "Чемпионат", icon: Trophy },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/weekend", label: "Текущий этап", icon: Flag },
  { href: "/fantasy", label: "Фентази лига", icon: Users },
  { href: "/polls", label: "Опросы", icon: Vote },
  { href: "/admin", label: "Админка", icon: Flag },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [profile, isAdmin, nextSession] = await Promise.all([
    getSessionProfileSummary(),
    getIsAdmin(),
    getNextSession(),
  ]);
  const visibleNavigation = navigation.filter((item) => item.href !== "/admin" || isAdmin);
  const sidebarSessionName = nextSession ? formatSessionName(nextSession.session) : "Расписание уточняется";
  const sidebarCountdown = nextSession
    ? formatSessionCountdown(nextSession.startsAtIso, nextSession.status)
    : "Расписание уточняется";

  return (
    <div className="min-h-dvh">
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/82 px-4 backdrop-blur-xl shadow-[0_2px_18px_rgb(225_6_0_/_0.12)] sm:px-6 lg:px-8 xl:hidden">
        <Link
          className="group flex items-center gap-3 rounded-md pr-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/"
          prefetch={false}
        >
          <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[0_0_24px_rgb(225_6_0_/_0.28)] transition-transform group-hover:scale-105 sm:size-11">
            <Flag aria-hidden="true" data-icon="inline-start" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-xl font-extrabold tracking-[-0.04em] sm:text-2xl lg:text-[1.7rem]">
              RaceMate
            </span>
            <span className="font-telemetry mt-1 hidden text-[0.58rem] font-bold uppercase tracking-[0.22em] text-muted-foreground sm:block">
              гоночный центр
            </span>
          </span>
        </Link>

        <details className="group relative xl:hidden">
          <summary
            aria-label="Открыть меню"
            className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
            role="button"
          >
            <span className="sr-only">Открыть меню</span>
            <Menu aria-hidden="true" className="size-5" />
          </summary>
          <div className="glass-card absolute right-0 top-12 z-40 grid w-[min(18rem,calc(100vw-2rem))] gap-2 rounded-lg p-2 shadow-2xl">
            {visibleNavigation.map((item) => (
              <Link
                className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={item.href}
                key={item.href}
                prefetch={false}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-1 border-t border-border pt-2">
              <AuthPanel profile={profile} />
            </div>
          </div>
        </details>
      </header>

      <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-64 flex-col border-r border-border bg-background/72 py-6 backdrop-blur-xl xl:flex">
        <div className="px-6 pb-5">
          <Link
            className="group flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/"
            prefetch={false}
          >
            <span className="flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-[0_0_24px_rgb(225_6_0_/_0.28)] transition-transform group-hover:scale-105">
              <Flag aria-hidden="true" data-icon="inline-start" />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="font-display truncate text-[1.7rem] font-extrabold tracking-[-0.04em]">
                RaceMate
              </span>
              <span className="font-telemetry mt-1 text-[0.58rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                гоночный центр
              </span>
            </span>
          </Link>
        </div>
        <div className="px-6 pb-6">
          <div className="glass-card rounded-lg p-4">
            <p className="font-telemetry text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              следующая сессия
            </p>
            <p className="font-display mt-2 text-sm font-bold">{sidebarSessionName}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {nextSession?.race ?? "Календарь сезона"}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className={`size-2 rounded-full ${nextSession?.status === "Live" ? "bg-success shadow-[0_0_14px_rgb(57_255_20_/_0.45)]" : "bg-primary shadow-[0_0_14px_rgb(225_6_0_/_0.35)]"}`} />
              <span className={`font-telemetry text-[0.65rem] font-extrabold uppercase tracking-[0.08em] ${nextSession?.status === "Live" ? "text-success" : "text-primary"}`}>
                {sidebarCountdown}
              </span>
            </div>
          </div>
        </div>
        <nav className="grid flex-1 content-start gap-1 overflow-y-auto" aria-label="Боковая навигация">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="group flex items-center gap-4 border-r-2 border-transparent px-6 py-3.5 text-muted-foreground transition-colors hover:border-primary hover:bg-accent/60 hover:text-foreground"
                href={item.href}
                key={item.href}
                prefetch={false}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="font-telemetry text-xs font-bold uppercase tracking-[0.08em]">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border px-6 pt-5">
          <AuthPanel profile={profile} />
        </div>
      </aside>

      <main className="mx-auto min-h-dvh w-full max-w-[1440px] px-4 pb-12 pt-20 sm:px-6 lg:px-8 xl:pl-[18rem] xl:pt-6">
        {children}
      </main>
    </div>
  );
}

function AuthPanel({
  profile,
}: {
  profile: Awaited<ReturnType<typeof getSessionProfileSummary>>;
}) {
  if (!profile) {
    return (
      <Button asChild className="w-full justify-center" size="sm">
        <Link href="/auth" prefetch={false}>
          Войти
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Link>
      </Button>
    );
  }

  return (
    <div className="grid gap-3">
      <Link
        className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-card/75 p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="/account"
        prefetch={false}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
          <UserRound aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">
            {profile.displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            Личный кабинет
          </span>
        </span>
      </Link>
      <form action={signOut}>
        <Button className="w-full justify-center" size="sm" type="submit" variant="secondary">
          Выйти
          <LogOut aria-hidden="true" data-icon="inline-end" />
        </Button>
      </form>
    </div>
  );
}
