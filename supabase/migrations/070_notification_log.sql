-- Dedupe ledger for automated reminder emails (medical-cert expiry, ADP hours
-- due). A row means "this reminder was already sent" — senders claim the key
-- before emailing, so retried cron runs and overlapping entry points can't
-- double-send. Service-role only: RLS enabled with no policies.

create table notification_log (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  dedupe_key text not null,
  sent_at    timestamptz not null default now(),
  unique (kind, dedupe_key)
);

alter table notification_log enable row level security;
