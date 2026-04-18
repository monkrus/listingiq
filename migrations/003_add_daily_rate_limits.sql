-- Daily rate limit counters (survives deploys, unlike in-memory counters)
create table if not exists public.daily_rate_limits (
  ip text not null,
  route text not null,
  day date not null,
  count integer not null default 0,
  primary key (ip, route, day)
);

-- Block all direct client access — only server-side RPCs should touch this table
alter table public.daily_rate_limits enable row level security;

-- Auto-delete rows older than 3 days to prevent unbounded growth
create index if not exists idx_daily_rate_limits_day on daily_rate_limits (day);

-- Atomic increment function: upserts a counter row and returns the new count
create or replace function increment_daily_rate_limit(
  p_ip text,
  p_route text,
  p_date date
) returns integer as $$
  insert into daily_rate_limits (ip, route, day, count)
  values (p_ip, p_route, p_date, 1)
  on conflict (ip, route, day)
  do update set count = daily_rate_limits.count + 1
  returning count;
$$ language sql volatile;
