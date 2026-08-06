import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  makeAdminJobRequestKey,
  validateAdminJobRequest,
} from "@/lib/admin-job-catalog";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export async function enqueueAdminJob(
  admin: AdminClient,
  input: {
    jobName: string;
    args?: Record<string, unknown>;
    requestedBy: string;
    retryOf?: string | null;
    requestKey?: string;
  },
) {
  const validated = validateAdminJobRequest(input.jobName, input.args ?? {});

  if (!validated.ok) {
    return validated;
  }

  const requestKey = input.requestKey ?? makeAdminJobRequestKey({
    requestedBy: input.requestedBy,
    jobName: input.jobName,
    args: validated.args,
    retryOf: input.retryOf,
  });
  const { data, error } = await admin
    .from("job_runs")
    .insert({
      job_name: input.jobName,
      status: "queued",
      queue_version: 1,
      requested_by: input.requestedBy,
      available_at: new Date().toISOString(),
      attempt_count: 0,
      max_attempts: validated.definition.maxAttempts,
      retry_of: input.retryOf ?? null,
      request_key: requestKey,
      items_processed: 0,
      metadata: {
        source: "admin",
        args: validated.args,
        title: validated.definition.title,
      },
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    return { ok: false as const, message: "Такая задача уже стоит в очереди." };
  }
  if (error) {
    throw error;
  }

  return {
    ok: true as const,
    definition: validated.definition,
    args: validated.args,
    jobRunId: data.id,
  };
}
