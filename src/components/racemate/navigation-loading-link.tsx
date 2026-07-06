"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { forwardRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { NavigationLoadingOverlay } from "@/components/racemate/navigation-loading-plate";

type NavigationLoadingLinkProps = Omit<
  React.ComponentProps<typeof Link>,
  "href" | "onClick"
> & {
  href: string;
  loadingLabel: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export const NavigationLoadingLink = forwardRef<HTMLAnchorElement, NavigationLoadingLinkProps>(
  function NavigationLoadingLink(
    {
      children,
      href,
      loadingLabel,
      onClick,
      target,
      ...props
    },
    ref,
  ) {
    const pathname = usePathname();
    const [loadingPath, setLoadingPath] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const hrefPath = getHrefPath(href);

    useEffect(() => {
      setMounted(true);
    }, []);

    useEffect(() => {
      setLoadingPath(null);
    }, [pathname]);

    return (
      <>
        <Link
          {...props}
          href={href}
          onClick={(event) => {
            onClick?.(event);

            if (event.defaultPrevented || shouldSkipLoading(event, href, pathname, target)) {
              return;
            }

            setLoadingPath(hrefPath);
          }}
          ref={ref}
          target={target}
        >
          {children}
        </Link>
        {mounted && loadingPath && loadingPath !== pathname
          ? createPortal(<NavigationLoadingOverlay label={loadingLabel} />, document.body)
          : null}
      </>
    );
  },
);

function shouldSkipLoading(
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string,
  pathname: string,
  target?: React.HTMLAttributeAnchorTarget,
) {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0 ||
    target === "_blank"
  ) {
    return true;
  }

  if (/^[a-z][a-z\d+\-.]*:/i.test(href)) {
    return true;
  }

  return getHrefPath(href) === pathname;
}

function getHrefPath(href: string) {
  return href.split("?")[0] || "/";
}
