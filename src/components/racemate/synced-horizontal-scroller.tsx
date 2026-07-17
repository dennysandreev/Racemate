"use client";

import type React from "react";
import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/utils";

type SyncedHorizontalScrollerProps = {
  children: React.ReactNode;
  className?: string;
  group: string;
};

const EVENT_NAME = "racemate:sync-horizontal-scroll";

export function SyncedHorizontalScroller({
  children,
  className,
  group,
}: SyncedHorizontalScrollerProps) {
  const id = useId();
  const frameRef = useRef<number | null>(null);
  const scrollingRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleSync(event: Event) {
      const detail = (event as CustomEvent<{
        group: string;
        left: number;
        source: string;
      }>).detail;

      if (!detail || detail.group !== group || detail.source === id || !scrollerRef.current) {
        return;
      }

      if (Math.abs(scrollerRef.current.scrollLeft - detail.left) < 0.5) {
        return;
      }

      scrollingRef.current = true;
      scrollerRef.current.scrollLeft = detail.left;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        scrollingRef.current = false;
        frameRef.current = null;
      });
    }

    window.addEventListener(EVENT_NAME, handleSync);

    return () => {
      window.removeEventListener(EVENT_NAME, handleSync);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [group, id]);

  return (
    <div
      className={cn("max-w-full overflow-x-auto", className)}
      data-sync-scroll-group={group}
      onScroll={(event) => {
        if (scrollingRef.current) {
          return;
        }

        window.dispatchEvent(new CustomEvent(EVENT_NAME, {
          detail: {
            group,
            left: event.currentTarget.scrollLeft,
            source: id,
          },
        }));
      }}
      ref={scrollerRef}
    >
      {children}
    </div>
  );
}
