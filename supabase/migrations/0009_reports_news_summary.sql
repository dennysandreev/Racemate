-- Grand Prix reports: news context used by the final AI summary.

alter table public.grand_prix_reports
add column if not exists news_summary jsonb not null default '{}'::jsonb;
