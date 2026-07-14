"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";

import { cn } from "@/lib/utils";

type ActiveNavigationLinkProps = React.ComponentProps<typeof Link> & {
  activeClassName: string;
  activePrefixes?: string[];
};

export function ActiveNavigationLink({
  activeClassName,
  activePrefixes,
  children,
  className,
  href,
  ...props
}: ActiveNavigationLinkProps) {
  const pathname = usePathname();
  const hrefPath = typeof href === "string" ? href.split("?")[0] : href.pathname ?? "";
  const prefixes = activePrefixes?.length ? activePrefixes : [hrefPath];
  const isActive = prefixes.some((prefix) => matchesPath(pathname, prefix));

  return (
    <Link
      {...props}
      aria-current={isActive ? "page" : undefined}
      className={cn(className, isActive && activeClassName)}
      href={href}
    >
      {children}
    </Link>
  );
}

function matchesPath(pathname: string, prefix: string) {
  if (prefix === "/") {
    return pathname === prefix;
  }

  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
