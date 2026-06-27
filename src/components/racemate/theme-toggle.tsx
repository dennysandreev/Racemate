"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

const storageKey = "racemate-theme";

function readTheme(): Theme {
  return window.localStorage.getItem(storageKey) === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTheme(readTheme()));

    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
    setTheme(nextTheme);
  }

  const isLight = theme === "light";

  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border bg-card/75 px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
        {isLight ? <Sun aria-hidden="true" className="size-4 text-warning" /> : <Moon aria-hidden="true" className="size-4 text-muted-foreground" />}
        {isLight ? "Светлая тема" : "Темная тема"}
      </span>
      <button
        aria-label={isLight ? "Включить темную тему" : "Включить светлую тему"}
        aria-checked={isLight}
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border bg-muted p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={toggleTheme}
        role="switch"
        type="button"
      >
        <Sun aria-hidden="true" className="absolute left-1.5 size-3 text-warning" />
        <Moon aria-hidden="true" className="absolute right-1.5 size-3 text-muted-foreground" />
        <span
          aria-hidden="true"
          className={cn(
            "relative size-5 rounded-full bg-primary shadow-sm transition-transform duration-200",
            isLight ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}
