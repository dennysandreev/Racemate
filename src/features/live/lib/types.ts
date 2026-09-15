import type { TrackMapDefinition } from "@/types/racemate";
export type LiveSession = {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  race_name?: string;
  circuit_short_name: string;
  date_start: string;
  date_end: string;
};
export type DriverLiveState = {
  driverNumber: number;
  acronym: string;
  fullName: string;
  team: string;
  teamColour: string;
  position: number | null;
  gap: string | number | null;
  interval: string | number | null;
  compound: string | null;
  tyreAge: number | null;
  lap: number;
  lastLap: number | null;
  bestLap: number | null;
  bestLapSectors?: (number | null)[];
  sectors: (number | null)[];
  bestSectors: (number | null)[];
  pitCount: number;
  pitEnteredAt?: string | null;
  status: string;
  eliminatedIn?: string | null;
  lastUpdatedAt: string | null;
  pace: { lap: number; duration: number; compound: string; pit: boolean }[];
  lapHistory?: {
    deleted?: boolean;
    lap: number;
    duration: number;
    compound: string | null;
    pit: boolean;
    sectors: (number | null)[];
  }[];
};
export type LocationSample = {
  pitLaneProgress?: number | null;
  timestamp: string;
  stationarySince?: string;
  x: number;
  y: number;
  z: number;
  progress: number;
};
export type TelemetrySample = {
  timestamp: string;
  speed: number | null;
  throttle: number | null;
  brake: number | null;
  rpm: number | null;
  gear: number | null;
  drs: number | null;
};
export type FeedEvent = {
  id: string;
  type: string;
  timestamp: string;
  driverNumber: number | null;
  lap: number | null;
  message: string;
  original: string | null;
  duration?: number;
};
export type RadioMessage = {
  test?: boolean;
  id: string;
  driverNumber: number;
  timestamp: string;
  lap: number | null;
  original: string | null;
  ru: string | null;
  status: "received" | "transcribing" | "ready" | "failed";
  playable: boolean;
};
export type WeatherState = {
  timestamp: string;
  air: number | null;
  track: number | null;
  rain: number | null;
  wind: number | null;
  humidity: number | null;
};
export type LiveSessionState = {
  session: LiveSession | null;
  drivers: Record<number, DriverLiveState>;
  locations: Record<number, LocationSample>;
  telemetry: Record<number, TelemetrySample>;
  events: FeedEvent[];
  radio: RadioMessage[];
  pits: {
    id: string;
    driverNumber: number;
    timestamp: string;
    lap: number;
    duration: number | null;
    laneDuration: number | null;
    before: string | null;
    after: string | null;
  }[];
  weather: WeatherState | null;
  track: TrackMapDefinition | null;
  trackSectorCount: number | null;
  yellowSectors: number[];
  status: string;
  flag: string | null;
  currentLap: number;
  totalLaps: number | null;
  phase: string | null;
  phaseEndsAt: string | null;
  phaseStartedAt: string | null;
  timerPausedAt: string | null;
  timerOffsetMs: number;
  replayReady: boolean;
  updatedAt: string | null;
};
export type LiveHealth = {
  status: string;
  sourceConnected: boolean;
  lastMessageAt: string | null;
  databaseWriterActive: boolean;
};
export type LiveMessage = {
  type: "snapshot" | "state" | "samples";
  data?: Partial<LiveSessionState>;
  health?: LiveHealth;
  serverTime: number;
  samples?: (
    | ({ type: "location"; driverNumber: number } & LocationSample)
    | ({ type: "telemetry"; driverNumber: number } & TelemetrySample)
  )[];
};
