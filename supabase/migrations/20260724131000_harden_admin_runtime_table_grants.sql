revoke all on table public.admin_job_schedules from anon;
revoke all on table public.ai_prompt_versions from anon;
revoke all on table public.admin_ai_budgets from anon;
revoke all on table public.admin_audit_log from anon;

revoke insert, update, delete, truncate, references, trigger
on table public.admin_job_schedules
from authenticated;
revoke insert, update, delete, truncate, references, trigger
on table public.ai_prompt_versions
from authenticated;
revoke insert, update, delete, truncate, references, trigger
on table public.admin_ai_budgets
from authenticated;
revoke insert, update, delete, truncate, references, trigger
on table public.admin_audit_log
from authenticated;

grant select on table public.admin_job_schedules to authenticated;
grant select on table public.ai_prompt_versions to authenticated;
grant select on table public.admin_ai_budgets to authenticated;
grant select on table public.admin_audit_log to authenticated;
