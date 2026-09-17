-- Who gets a course's numbers — a list of its own.
--
-- This started as a second tick on billing_recipients, on the theory that the
-- people who raise our invoices and the people who read a course's profit and
-- loss mostly overlap. They do not. Harken's billers are two people at one
-- firm with a tokenised queue to work; the readers of a P&L are whoever is
-- asking that quarter — an accountant, a partner, somebody preparing for a
-- board conversation — and none of them should be holding a credential to a
-- billing queue they will never open.
--
-- So: its own table, with no token in it at all. A reader is an address we
-- send a per-course link to, and the link belongs to the course rather than
-- to them (see course_actuals.share_token). Nothing here can reach anything
-- on its own.
create table if not exists public.report_recipients (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null unique,
  -- Who they are to us. Not assumed to be Harken: that assumption is the
  -- thing this table exists to stop making.
  org         text,
  -- Retired rather than deleted, the same bargain the billers get: somebody
  -- who read last year's numbers should stop being offered without their
  -- name having to be explained away.
  active      boolean not null default true,
  notes       text
);

comment on table public.report_recipients is
  'People we send a course''s actuals to — costs, pay, margin, net. Deliberately separate from billing_recipients: different people, and no token of their own.';

alter table public.report_recipients enable row level security;

drop policy if exists "report_recipients: admin all" on public.report_recipients;
create policy "report_recipients: admin all" on public.report_recipients for all using (public.is_admin());

grant select, insert, update, delete on public.report_recipients to authenticated;

-- billing_recipients.reads_pnl (193) is superseded by this table and no longer
-- read by anything. It is left in place for now rather than dropped in the
-- same breath: the running build still selects it, and a column that vanishes
-- before the code that reads it takes every course page with it. A later
-- migration drops both it and `bills` once this deploy is live.
