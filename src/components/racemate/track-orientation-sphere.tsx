"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { normalizeDegrees, orbitTrackModelCamera } from "@/lib/track-model-camera";
import {
  TRACK_MODEL_ROTATION_STEP,
  TRACK_MODEL_TILT_MAX,
  TRACK_MODEL_TILT_MIN,
  TRACK_MODEL_TILT_STEP,
} from "@/lib/track-model-renderer";

type TrackOrientationSphereProps = {
  initialRotationDeg: number;
  initialTiltDeg: number;
  onChange: (rotationDeg: number, tiltDeg: number) => void;
  rotationDeg: number;
  tiltDeg: number;
};

type SphereDrag = {
  pointerId: number;
  startRotationDeg: number;
  startTiltDeg: number;
  startX: number;
  startY: number;
};

export function TrackOrientationSphere({
  initialRotationDeg,
  initialTiltDeg,
  onChange,
  rotationDeg,
  tiltDeg,
}: TrackOrientationSphereProps) {
  const dragRef = useRef<SphereDrag | null>(null);
  const relativeRotation = normalizeDegrees(rotationDeg - initialRotationDeg);
  const rotationRadians = (relativeRotation * Math.PI) / 180;
  const tiltProgress =
    (tiltDeg - TRACK_MODEL_TILT_MIN) / (TRACK_MODEL_TILT_MAX - TRACK_MODEL_TILT_MIN);
  const markerX = Math.sin(rotationRadians) * 14;
  const markerY = (tiltProgress - 0.5) * 20;

  function endDrag(pointerId: number, element: HTMLButtonElement) {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }

    if (dragRef.current?.pointerId === pointerId) {
      dragRef.current = null;
    }
  }

  function changeByKeyboard(rotationDelta: number, tiltDelta: number) {
    onChange(
      normalizeDegrees(rotationDeg + rotationDelta),
      Math.min(
        TRACK_MODEL_TILT_MAX,
        Math.max(TRACK_MODEL_TILT_MIN, tiltDeg + tiltDelta),
      ),
    );
  }

  return (
    <Button
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
      aria-label="Сфера ракурса. Перетаскивай, чтобы вращать трассу в 3D"
      className="absolute left-3 top-3 size-14 touch-none cursor-grab rounded-full border-white/20 bg-black/65 p-1.5 text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.16)] active:cursor-grabbing sm:size-16"
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onChange(initialRotationDeg, initialTiltDeg);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          changeByKeyboard(-TRACK_MODEL_ROTATION_STEP, 0);
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          changeByKeyboard(TRACK_MODEL_ROTATION_STEP, 0);
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          changeByKeyboard(0, -TRACK_MODEL_TILT_STEP);
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          changeByKeyboard(0, TRACK_MODEL_TILT_STEP);
        }

        if (event.key === "Home") {
          event.preventDefault();
          event.stopPropagation();
          onChange(initialRotationDeg, initialTiltDeg);
        }
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        endDrag(event.pointerId, event.currentTarget);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          startRotationDeg: rotationDeg,
          startTiltDeg: tiltDeg,
          startX: event.clientX,
          startY: event.clientY,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;

        if (!drag || drag.pointerId !== event.pointerId) return;

        event.preventDefault();
        event.stopPropagation();
        const next = orbitTrackModelCamera({
          deltaX: event.clientX - drag.startX,
          deltaY: event.clientY - drag.startY,
          maximumTiltDeg: TRACK_MODEL_TILT_MAX,
          minimumTiltDeg: TRACK_MODEL_TILT_MIN,
          rotationSensitivity: 1.15,
          startRotationDeg: drag.startRotationDeg,
          startTiltDeg: drag.startTiltDeg,
          tiltSensitivity: 0.85,
        });
        onChange(next.rotationDeg, next.tiltDeg);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        endDrag(event.pointerId, event.currentTarget);
      }}
      size="icon"
      title="Повернуть ракурс"
      type="button"
      variant="secondary"
    >
      <span
        aria-hidden="true"
        className="relative block size-full overflow-hidden rounded-full border border-white/35 bg-[radial-gradient(circle_at_32%_26%,rgb(255_255_255_/_0.72)_0%,rgb(95_113_105_/_0.42)_28%,rgb(7_16_12_/_0.96)_70%)] shadow-[inset_-5px_-7px_12px_rgb(0_0_0_/_0.5),inset_2px_2px_5px_rgb(255_255_255_/_0.16)]"
      >
        <span
          className="absolute bottom-1 left-1/2 top-1 w-[34%] -translate-x-1/2 rounded-[50%] border-x border-white/30 transition-transform duration-150 motion-reduce:transition-none"
          style={{ transform: `translateX(-50%) rotate(${relativeRotation}deg)` }}
        />
        <span
          className="absolute left-1 right-1 top-1/2 h-[34%] -translate-y-1/2 rounded-[50%] border-y border-white/30 transition-transform duration-150 motion-reduce:transition-none"
          style={{ transform: `translateY(-50%) rotate(${(tiltDeg - initialTiltDeg) * 0.55}deg)` }}
        />
        <span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
        <span
          className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/70 bg-primary transition-transform duration-150 motion-reduce:transition-none"
          style={{ transform: `translate(calc(-50% + ${markerX}px), calc(-50% + ${markerY}px))` }}
        />
      </span>
    </Button>
  );
}
