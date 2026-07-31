-- Rate-limit ledger for unauthenticated actions that send email or create
-- accounts (contact form, course self-registration). Without this, anyone can
-- loop those endpoints to mail-bomb third parties from the Peak Rescue domain
-- and burn Resend/Supabase quota.
--
-- One row per (action, subject) window; the checker increments and compares.
-- Service-role only: RLS enabled with no policies.

create table if not exists public.rate_limits (
  id           uuid primary key default gen_random_uuid(),
  action       text not null,
  subject      text not null,
  window_start timestamptz not null default now(),
  count        int not null default 1,
  unique (action, subject, window_start)
);

create index if not exists rate_limits_lookup
  on public.rate_limits (action, subject, window_start desc);

alter table public.rate_limits enable row level security;
