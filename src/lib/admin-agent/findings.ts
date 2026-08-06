import { sanitizeAdminAuditPayload } from "@/lib/admin-audit";
import type { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  AdminFindingCategory,
  AdminFindingSeverity,
} from "@/types/admin";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export { makeAdminFindingFingerprint } from "@/lib/admin-agent/fingerprint";

export async function recordAdminFinding(
  admin: AdminClient,
  input: {
    fingerprint: string;
    category: AdminFindingCategory;
    severity: AdminFindingSeverity;
    title: string;
    description: string;
    evidence?: Record<string, unknown>;
    route?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    jobRunId?: string | null;
    releaseSha?: string | null;
  },
) {
  const { data, error } = await admin.rpc("record_admin_finding", {
    p_fingerprint: input.fingerprint,
    p_category: input.category,
    p_severity: input.severity,
    p_title: input.title.slice(0, 180),
    p_description: input.description.slice(0, 4_000),
    p_evidence: sanitizeAdminAuditPayload(input.evidence ?? {}),
    p_route: input.route?.slice(0, 500) ?? null,
    p_entity_type: input.entityType?.slice(0, 80) ?? null,
    p_entity_id: input.entityId?.slice(0, 200) ?? null,
    p_job_run_id: input.jobRunId ?? null,
    p_release_sha: input.releaseSha ?? null,
  });

  if (error) {
    throw error;
  }

  return data[0] ?? null;
}
