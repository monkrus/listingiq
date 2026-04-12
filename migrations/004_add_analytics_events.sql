-- Request analytics: track every analysis for business metrics
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  route text not null,           -- 'analyze' | 'analyze-photos'
  plan text,                     -- 'quick-score' | 'full-audit' | null (demo)
  success boolean not null,
  duration_ms integer not null,
  is_demo boolean not null default false,
  is_reaccess boolean not null default false,
  cache_hit boolean not null default false,
  photo_count integer,           -- number of photos analyzed (photos route only)
  error text                     -- error message on failure
);

-- Index for dashboard queries (reports per day, success rate)
create index idx_analytics_created on analytics_events (created_at desc);
create index idx_analytics_route on analytics_events (route, created_at desc);

-- RLS: server-only table
alter table public.analytics_events enable row level security;

-- Useful queries for your dashboard:
--
-- Reports per day:
--   SELECT date_trunc('day', created_at) AS day, count(*) FROM analytics_events WHERE route='analyze' AND success GROUP BY 1 ORDER BY 1 DESC LIMIT 30;
--
-- Revenue per day (assuming each success = 1 sale):
--   SELECT date_trunc('day', created_at) AS day, count(*) FILTER (WHERE plan='quick-score') * 29 + count(*) FILTER (WHERE plan='full-audit') * 49 AS revenue FROM analytics_events WHERE success AND NOT is_demo AND NOT is_reaccess GROUP BY 1 ORDER BY 1 DESC LIMIT 30;
--
-- Success rate:
--   SELECT count(*) FILTER (WHERE success)::float / count(*) AS success_rate FROM analytics_events WHERE created_at > now() - interval '7 days';
--
-- Avg response time:
--   SELECT route, round(avg(duration_ms)) AS avg_ms FROM analytics_events GROUP BY route;
