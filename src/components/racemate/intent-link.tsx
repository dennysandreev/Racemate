"use client";

import Link, { useLinkStatus } from "next/link";
import { useState, type ComponentProps } from "react";

/** Prefetch a destination only after pointer or keyboard intent. */
export function IntentLink({
  href,
  children,
  onFocus,
  onMouseEnter,
  prefetch,
  ...props
}: ComponentProps<typeof Link>) {
  const [intentHref, setIntentHref] = useState<typeof href | null>(null);
  const prepare = () => {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;

    if (!connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType ?? "")) {
      setIntentHref(href);
    }
  };

  return (
    <Link
      {...props}
      href={href}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) prepare();
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (!event.defaultPrevented) prepare();
      }}
      prefetch={prefetch ?? (intentHref === href)}
    >
      {children}
      <PendingNavigation />
    </Link>
  );
}

function PendingNavigation() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span className="fixed inset-x-0 top-0 z-[90] h-0.5 animate-pulse bg-primary motion-reduce:animate-none" role="status">
      <span className="sr-only">Открываем страницу</span>
    </span>
  ) : null;
}
