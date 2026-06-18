"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type MainNavigationProps = {
  items: { href: string; label: string }[];
};

export function MainNavigation({ items }: MainNavigationProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Основная навигация"
      className="hidden items-center gap-1 rounded-md border border-border bg-card/70 p-1 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)] backdrop-blur-md lg:flex"
    >
      {items.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            className={cn(
              "font-telemetry relative rounded-sm px-3.5 py-2 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "before:absolute before:inset-x-3 before:-bottom-1 before:h-px before:scale-x-0 before:bg-primary before:transition-transform",
              "hover:bg-accent hover:text-foreground hover:before:scale-x-100",
              isActive &&
                "bg-primary text-primary-foreground shadow-[0_0_18px_rgb(225_6_0_/_0.22)] before:scale-x-100 before:bg-primary-foreground/80 hover:bg-primary hover:text-primary-foreground",
            )}
            href={item.href}
            key={item.href}
            prefetch={false}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
