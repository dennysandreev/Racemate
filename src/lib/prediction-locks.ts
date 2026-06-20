import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PredictionLocks = {
  poleLocked: boolean;
  qualifyingStartsAtIso: string | null;
  raceLocked: boolean;
  raceStartsAtIso: string | null;
};

type PredictionValues = {
  poleDriverId: string | null;
  winnerDriverId: string | null;
  fastestLapDriverId: string | null;
  dnfDriverId: string | null;
};

const unlockedPredictionLocks: PredictionLocks = {
  poleLocked: false,
  qualifyingStartsAtIso: null,
  raceLocked: false,
  raceStartsAtIso: null,
};

export async function getPredictionLocksForRace(raceId: string): Promise<PredictionLocks> {
  const supabase = await createSupabaseServerClient();

  if (!supabase || !raceId) {
    return unlockedPredictionLocks;
  }

  const { data } = await supabase
    .from("sessions")
    .select("session_type, start_at")
    .eq("race_id", raceId)
    .in("session_type", ["qualifying", "race"]);

  const qualifyingStartsAtIso =
    data?.find((session) => session.session_type === "qualifying")?.start_at ?? null;
  const raceStartsAtIso =
    data?.find((session) => session.session_type === "race")?.start_at ?? null;
  const now = Date.now();

  return {
    qualifyingStartsAtIso,
    raceStartsAtIso,
    poleLocked: isStarted(qualifyingStartsAtIso, now),
    raceLocked: isStarted(raceStartsAtIso, now),
  };
}

export function preserveLockedPredictionValues({
  current,
  locks,
  submitted,
}: {
  current: PredictionValues | null;
  locks: PredictionLocks;
  submitted: PredictionValues;
}): PredictionValues {
  return {
    poleDriverId: locks.poleLocked ? current?.poleDriverId ?? null : submitted.poleDriverId,
    winnerDriverId: locks.raceLocked ? current?.winnerDriverId ?? null : submitted.winnerDriverId,
    fastestLapDriverId: locks.raceLocked
      ? current?.fastestLapDriverId ?? null
      : submitted.fastestLapDriverId,
    dnfDriverId: locks.raceLocked ? current?.dnfDriverId ?? null : submitted.dnfDriverId,
  };
}

function isStarted(value: string | null, now: number) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) && timestamp <= now;
}
