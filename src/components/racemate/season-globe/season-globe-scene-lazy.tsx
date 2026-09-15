"use client";

import * as Sentry from "@sentry/nextjs";
import dynamic from "next/dynamic";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { SeasonGlobeStaticPreview } from "@/components/racemate/season-globe/season-globe-static-preview";
import type { SeasonGlobeEvent } from "@/types/racemate";

const SeasonGlobeScene = dynamic(
  () => import("./season-globe-scene").then((module) => module.SeasonGlobeScene),
  {
    loading: () => <SeasonGlobeStaticPreview />,
    ssr: false,
  },
);

type SeasonGlobeSceneLazyProps = {
  events: SeasonGlobeEvent[];
  fallback: ReactNode;
  onOpenSelected: () => void;
  onSelectRelative: (offset: number) => void;
  onSelectRound: (round: number) => void;
  onSelectNext: () => void;
  selectedRound: number;
  season: number;
};

export function SeasonGlobeSceneLazy(props: SeasonGlobeSceneLazyProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    const element = rootRef.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => {
        if (supportsWebGl()) {
          setIsNearViewport(true);
        } else {
          setHasFailed(true);
        }
      });
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (supportsWebGl()) {
            setIsNearViewport(true);
          } else {
            setHasFailed(true);
          }
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-full min-h-0 w-full" ref={rootRef}>
      {hasFailed ? (
        props.fallback
      ) : isNearViewport ? (
        <SceneErrorBoundary fallback={props.fallback} onFailure={() => setHasFailed(true)}>
          <SeasonGlobeScene {...props} onFailure={() => setHasFailed(true)} />
        </SceneErrorBoundary>
      ) : (
        <SeasonGlobeStaticPreview />
      )}
    </div>
  );
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    this.props.onFailure();
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function supportsWebGl() {
  try {
    const canvas = document.createElement("canvas");

    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
