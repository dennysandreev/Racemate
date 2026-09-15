import type { SupabaseClient } from "@supabase/supabase-js";
import type { Comparison, SavedComparison } from "./types";
export function hash(value: unknown): string;
export function createTelemetryDb(): SupabaseClient;
export class TelemetryStore {
  constructor(db: SupabaseClient);
  db: SupabaseClient;
  get<T = unknown>(key: string): Promise<T | null>;
  put(key: string, payload: unknown, ttl?: number | null): Promise<void>;
  enqueue(task: unknown): Promise<string>;
  task(
    id: string,
  ): Promise<{
    id: string;
    task: unknown;
    status: string;
    result_key: string | null;
    error_code: string | null;
    job_id: string | null;
    updated_at: string;
  } | null>;
  saveComparison(comparison: Comparison): Promise<string>;
  getComparison(id: string): Promise<SavedComparison | null>;
}
