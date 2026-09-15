-- Let the public report flow update only the delivery state of the report ID
-- it has just received, without creating a service-role client in the web action.

create or replace function public.finish_news_error_report_delivery(
  p_report_id uuid,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_count integer;
begin
  if p_report_id is null
    or p_status not in ('sent', 'failed', 'not_configured')
    or char_length(coalesce(p_error, '')) > 500 then
    return false;
  end if;

  update public.user_error_reports report
  set
    telegram_status = p_status,
    telegram_error = nullif(left(trim(coalesce(p_error, '')), 500), ''),
    telegram_sent_at = case when p_status = 'sent' then now() else null end
  where report.id = p_report_id
    and report.telegram_status = 'pending'
    and report.created_at >= now() - interval '10 minutes';

  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

revoke all on function public.finish_news_error_report_delivery(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.finish_news_error_report_delivery(uuid, text, text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
