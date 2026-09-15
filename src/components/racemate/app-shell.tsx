import { telemetryFlags } from "@/features/telemetry/lib/flags";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/racemate/ad-slot";

import { IntentLink as Link } from "@/components/racemate/intent-link";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CarFront,
  Flag,
  Menu,
  Newspaper,
  Radio,
  Trophy,
  Users,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActiveNavigationLink } from "@/components/racemate/active-navigation-link";
import { MobileAutoHideHeader } from "@/components/racemate/mobile-auto-hide-header";
import {
  RaceMateLogo,
  RaceMateMark,
} from "@/components/racemate/racemate-logo";
import { SidebarSessionStatus } from "@/components/racemate/sidebar-session-status";
import { SiteFooter } from "@/components/racemate/site-footer";
import { ThemeToggle } from "@/components/racemate/theme-toggle";
import { getNextSession } from "@/data/racemate-repository";
import {
  getIsAdmin,
  getSessionProfileSummary,
  getSessionUser,
} from "@/lib/auth";
import { getSubscriptionAccess } from "@/lib/billing/access";
import { formatSubscriptionTimeLeft } from "@/lib/billing/subscription-display";
import type { SubscriptionAccess } from "@/lib/billing/types";
import { formatSessionName } from "@/lib/session-display";
import { cn } from "@/lib/utils";

const navigation = [
  {
    href: "/news",
    label: "Новости",
    icon: Newspaper,
    activePrefixes: ["/news"],
  },
  { href: "/social", label: "Соцсети", icon: Radio },
  {
    href: "/leaderboard",
    label: "Чемпионат",
    icon: Trophy,
    activePrefixes: ["/leaderboard"],
  },
  {
    href: "/drivers",
    label: "Пилоты",
    icon: UserRound,
    activePrefixes: ["/drivers"],
  },
  {
    href: "/teams",
    label: "Команды",
    icon: CarFront,
    activePrefixes: ["/teams"],
  },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  {
    href: "/weekend",
    label: "Текущий этап",
    icon: Flag,
    activePrefixes: ["/weekend", "/race-replay"],
  },
  ...(telemetryFlags.telemetryHub
    ? [
        {
          href: "/telemetry",
          label: "Телеметрия",
          icon: Activity,
          activePrefixes: ["/telemetry"],
        },
      ]
    : []),
  {
    href: "/fantasy",
    label: "Фентази лига",
    icon: Users,
    activePrefixes: ["/fantasy", "/leagues", "/predictions", "/prediction"],
  },
  { href: "/admin", label: "Админка", icon: Flag },
];

export function AppShell({
  children,
  hideAds = false,
  immersive = false,
  leaderboardTable,
  viewport = false,
}: {
  children: React.ReactNode;
  hideAds?: boolean;
  immersive?: boolean;
  leaderboardTable?: "drivers" | "constructors";
  viewport?: boolean;
}) {
  const profilePromise = getSessionProfileSummary();
  const adminPromise = getIsAdmin();
  const nextSessionPromise = getNextSession();
  const subscriptionPromise = getSessionUser().then((user) =>
    getSubscriptionAccess(user?.id ?? null),
  );
  const visibleNavigation = navigation.filter((item) => item.href !== "/admin");

  return (
    <div
      className={
        viewport ? "telemetry-app-shell h-dvh overflow-hidden" : "min-h-dvh"
      }
    >
      <MobileAutoHideHeader className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/82 px-4 backdrop-blur-xl shadow-[0_2px_18px_rgb(225_6_0_/_0.12)] sm:px-6 lg:px-8 xl:hidden">
        <Link
          aria-label="RaceSide, на главную"
          className="group flex items-center rounded-md pr-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/"
        >
          <RaceMateLogo />
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
          <div className="absolute right-0 top-12 z-40 grid w-[min(18rem,calc(100vw-2rem))] gap-2 rounded-lg border border-border bg-background p-2 shadow-2xl">
            {visibleNavigation.map((item) => (
              <ActiveNavigationLink
                activeClassName="bg-primary/12 text-foreground shadow-[inset_3px_0_0_var(--primary)]"
                activePrefixes={item.activePrefixes}
                className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={getNavigationHref(item.href, leaderboardTable)}
                key={item.href}
              >
                {item.label}
              </ActiveNavigationLink>
            ))}
            <Suspense fallback={null}>
              <AdminNavigationItem adminPromise={adminPromise} mobile />
            </Suspense>
            <div className="mt-1 grid gap-2 border-t border-border pt-2">
              <ThemeToggle />
              <Suspense fallback={<PlusNavigationMark compact />}>
                <PlusNavigationStatus
                  compact
                  subscriptionPromise={subscriptionPromise}
                />
              </Suspense>
              <Suspense fallback={<Skeleton className="h-10 w-full" />}>
                <SessionAuthPanel profilePromise={profilePromise} />
              </Suspense>
            </div>
          </div>
        </details>
      </MobileAutoHideHeader>

      <aside className="raceside-desktop-sidebar fixed bottom-0 left-0 top-0 z-30 hidden w-64 flex-col border-r border-border bg-background/72 backdrop-blur-xl xl:flex">
        <div className="raceside-sidebar-brand px-6">
          <Link
            aria-label="RaceSide, на главную"
            className="group flex items-center rounded-md p-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/"
          >
            <RaceMateLogo />
          </Link>
        </div>
        <div className="raceside-sidebar-session px-6">
          <div className="glass-card rounded-lg p-4">
            <p className="font-telemetry text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              следующая сессия
            </p>
            <Suspense
              fallback={<Skeleton className="mt-2 h-[4.25rem] w-full" />}
            >
              <NextSessionPanel sessionPromise={nextSessionPromise} />
            </Suspense>
          </div>
        </div>
        <nav
          className="raceside-desktop-navigation grid min-h-0 flex-1 content-start"
          aria-label="Боковая навигация"
        >
          {visibleNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <ActiveNavigationLink
                activeClassName="border-primary bg-primary/10 text-foreground shadow-[inset_3px_0_0_rgb(225_6_0_/_0.18)]"
                activePrefixes={item.activePrefixes}
                className="group flex items-center gap-4 border-r-2 border-transparent px-6 py-3.5 text-muted-foreground transition-colors hover:border-primary hover:bg-accent/60 hover:text-foreground [&[aria-current=page]_svg]:text-primary"
                href={getNavigationHref(item.href, leaderboardTable)}
                key={item.href}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="font-telemetry text-xs font-bold uppercase tracking-[0.08em]">
                  {item.label}
                </span>
              </ActiveNavigationLink>
            );
          })}
          <Suspense fallback={null}>
            <AdminNavigationItem adminPromise={adminPromise} />
          </Suspense>
        </nav>
        <div className="raceside-sidebar-account grid border-t border-border px-6">
          <ThemeToggle />
          <Suspense fallback={<PlusNavigationMark />}>
            <PlusNavigationStatus subscriptionPromise={subscriptionPromise} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-10 w-full" />}>
            <SessionAuthPanel profilePromise={profilePromise} />
          </Suspense>
        </div>
      </aside>

      <main
        className={
          viewport
            ? "mx-auto flex h-dvh w-full max-w-[1440px] min-w-0 flex-col overflow-hidden px-4 pb-3 pt-20 sm:px-6 lg:px-8 xl:pl-[18rem] xl:pt-6"
            : immersive
              ? "mx-auto min-h-dvh w-full max-w-[1440px] px-4 pb-0 pt-20 sm:px-6 lg:px-8 xl:pl-[18rem] xl:pt-6"
              : "mx-auto min-h-dvh w-full max-w-[1440px] px-4 pb-12 pt-20 sm:px-6 lg:px-8 xl:pl-[18rem] xl:pt-6"
        }
      >
        {children}
      </main>
      {!viewport && !immersive && !hideAds && (
        <Suspense fallback={null}>
          <AdSlot />
        </Suspense>
      )}
      {!viewport && !immersive && <SiteFooter />}
    </div>
  );
}

function PlusNavigationMark({
  active = false,
  compact = false,
  periodEnd = null,
}: {
  active?: boolean;
  compact?: boolean;
  periodEnd?: string | null;
}) {
  const timeLeft = active ? formatSubscriptionTimeLeft(periodEnd) : null;

  return (
    <Link
      aria-label={
        timeLeft
          ? `RaceSide Plus — подписка активна, ${timeLeft.toLowerCase()}`
          : "RaceSide Plus — подписка"
      }
      className={cn(
        "group flex items-center justify-between rounded-md border px-3 transition-[border-color,background-color,box-shadow]",
        compact ? "py-2" : "mb-2 py-2.5",
        timeLeft
          ? "border-success/30 bg-success/5 shadow-[0_0_18px_rgb(57_255_20_/_0.04)] hover:border-success/45 hover:bg-success/8"
          : "border-primary/25 bg-primary/6 hover:border-primary/55 hover:bg-primary/10",
      )}
      href="/plus"
    >
      <span className="flex shrink-0 items-center gap-1">
        <RaceMateMark
          className={cn("h-4 w-[2.15rem]", timeLeft && "text-success/70")}
        />
        <span
          className={cn(
            "font-display text-lg font-black leading-none",
            timeLeft ? "text-success/70" : "text-primary",
          )}
        >
          +
        </span>
      </span>
      <span
        className={cn(
          "flex min-w-0 flex-col items-end font-telemetry font-bold uppercase leading-none transition-colors",
          timeLeft
            ? "text-success/70"
            : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        <span className="whitespace-nowrap text-[0.48rem] tracking-[0.14em]">
          {timeLeft ? "Подписка активна" : "Подписка"}
        </span>
        <span className="mt-1 whitespace-nowrap text-[0.53rem] tracking-[0.13em]">
          {timeLeft ?? "RaceSide Plus"}
        </span>
      </span>
    </Link>
  );
}

async function PlusNavigationStatus({
  compact = false,
  subscriptionPromise,
}: {
  compact?: boolean;
  subscriptionPromise: Promise<SubscriptionAccess>;
}) {
  const access = await subscriptionPromise;
  return (
    <PlusNavigationMark
      active={access.active}
      compact={compact}
      periodEnd={access.periodEnd}
    />
  );
}

async function SessionAuthPanel({
  profilePromise,
}: {
  profilePromise: ReturnType<typeof getSessionProfileSummary>;
}) {
  return <AuthPanel profile={await profilePromise} />;
}

async function NextSessionPanel({
  sessionPromise,
}: {
  sessionPromise: ReturnType<typeof getNextSession>;
}) {
  const nextSession = await sessionPromise;
  const sidebarSessionName = nextSession
    ? formatSessionName(nextSession.session)
    : "Расписание уточняется";
  return (
    <>
      <p className="font-display mt-2 text-sm font-bold">
        {sidebarSessionName}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {nextSession?.race ?? "Календарь сезона"}
      </p>
      <SidebarSessionStatus
        sessionName={nextSession?.session}
        startsAtIso={nextSession?.startsAtIso}
        status={nextSession?.status}
      />
    </>
  );
}

async function AdminNavigationItem({
  adminPromise,
  mobile = false,
}: {
  adminPromise: ReturnType<typeof getIsAdmin>;
  mobile?: boolean;
}) {
  if (!(await adminPromise)) return null;

  return (
    <ActiveNavigationLink
      activeClassName={
        mobile
          ? "bg-primary/12 text-foreground"
          : "border-primary bg-primary/10 text-foreground"
      }
      className={
        mobile
          ? "rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          : "group flex items-center gap-4 border-r-2 border-transparent px-6 py-3.5 text-muted-foreground hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
      href="/admin"
    >
      {!mobile && <Flag aria-hidden="true" className="size-5" />}
      <span
        className={
          mobile
            ? undefined
            : "font-telemetry text-xs font-bold uppercase tracking-[0.08em]"
        }
      >
        Админка
      </span>
    </ActiveNavigationLink>
  );
}

function getNavigationHref(
  href: string,
  leaderboardTable?: "drivers" | "constructors",
) {
  if (href === "/leaderboard" && leaderboardTable === "constructors") {
    return "/leaderboard?table=constructors";
  }

  return href;
}

function AuthPanel({
  profile,
}: {
  profile: Awaited<ReturnType<typeof getSessionProfileSummary>>;
}) {
  if (!profile) {
    return (
      <Button asChild className="h-10 w-full justify-center" size="sm">
        <Link href="/auth">
          Войти
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Link>
      </Button>
    );
  }

  return (
    <Link
      className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-border bg-card/75 px-2.5 py-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href="/account"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-primary/12 text-primary">
        <UserRound aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold leading-tight text-foreground">
          {profile.displayName}
        </span>
        <span className="block truncate text-[0.65rem] leading-tight text-muted-foreground">
          Личный кабинет
        </span>
      </span>
    </Link>
  );
}
