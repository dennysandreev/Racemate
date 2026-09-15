"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const PHONE_MEDIA_QUERY = "(max-width: 639px)";
const DIRECTION_THRESHOLD_PX = 6;
const TOP_REVEAL_OFFSET_PX = 16;

export function MobileAutoHideHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const phoneQuery = window.matchMedia(PHONE_MEDIA_QUERY);
    let lastScrollY = Math.max(window.scrollY, 0);
    let frameId: number | null = null;

    const updateHeader = () => {
      const currentScrollY = Math.max(window.scrollY, 0);
      const delta = currentScrollY - lastScrollY;

      if (!phoneQuery.matches || currentScrollY <= TOP_REVEAL_OFFSET_PX) {
        setHidden(false);
      } else if (
        delta > DIRECTION_THRESHOLD_PX &&
        !headerRef.current?.contains(document.activeElement)
      ) {
        setHidden(true);
      } else if (delta < -DIRECTION_THRESHOLD_PX) {
        setHidden(false);
      }

      lastScrollY = currentScrollY;
      frameId = null;
    };

    const handleScroll = () => {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(updateHeader);
      }
    };

    const handleBreakpointChange = () => {
      lastScrollY = Math.max(window.scrollY, 0);
      setHidden(false);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    phoneQuery.addEventListener("change", handleBreakpointChange);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      phoneQuery.removeEventListener("change", handleBreakpointChange);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <header
      className={cn(
        "transition-transform duration-200 ease-out motion-reduce:transition-none",
        hidden && "pointer-events-none -translate-y-full",
        "sm:pointer-events-auto sm:translate-y-0",
        className,
      )}
      ref={headerRef}
    >
      {children}
    </header>
  );
}
