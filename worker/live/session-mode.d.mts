export type LiveSessionMode =
  | "practice"
  | "qualifying"
  | "sprint_qualifying"
  | "sprint"
  | "race"
  | "unknown";
type SessionLike =
  | { session_type?: string; session_name?: string; advancing_drivers?: number }
  | null
  | undefined;
export function sessionMode(session: SessionLike): LiveSessionMode;
export function sessionCapabilities(session: SessionLike): {
  mode: LiveSessionMode;
  showRaceGap: boolean;
  showIntervals: boolean;
  showLapCounter: boolean;
  showCountdown: boolean;
  showQualifyingPhase: boolean;
  showEliminationZone: boolean;
  showPitCount: boolean;
  rankByLapTime: boolean;
};
export function sessionLabel(session: SessionLike): string;
export function chooseSession<
  T extends { date_start: string; date_end: string },
>(
  rows: T[],
  now?: number,
): { session: T | null; active: boolean; previous: T | null };
