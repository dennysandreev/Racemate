"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

type TurnstileApi = {
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark" | "light" | "auto";
    },
  ) => string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget({ siteKey }: { siteKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const removeWidget = useCallback(() => {
    const widgetId = widgetIdRef.current;

    if (widgetId && window.turnstile) {
      try {
        window.turnstile.remove(widgetId);
      } catch {
        // The script can remove an expired widget before React unmounts it.
      }
    }

    widgetIdRef.current = null;
    containerRef.current?.replaceChildren();
  }, []);

  const renderWidget = useCallback(() => {
    const container = containerRef.current;
    const turnstile = window.turnstile;

    if (!container || !turnstile || widgetIdRef.current) {
      return;
    }

    container.replaceChildren();
    widgetIdRef.current = turnstile.render(container, {
      sitekey: siteKey,
      theme: "dark",
    });
  }, [siteKey]);

  useEffect(() => {
    renderWidget();

    return removeWidget;
  }, [removeWidget, renderWidget]);

  return (
    <>
      <Script
        id="cloudflare-turnstile"
        onReady={renderWidget}
        src={TURNSTILE_SCRIPT_URL}
        strategy="afterInteractive"
      />
      <div className="min-h-[65px]" ref={containerRef} />
    </>
  );
}
