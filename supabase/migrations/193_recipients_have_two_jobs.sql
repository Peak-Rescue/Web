-- One list of outside people, with two jobs on it.
--
-- billing_recipients was built for the one person at Harken who raises our
-- invoices. The course's profit and loss needs sending too — to an accountant,
-- to whoever is asking why a course came in where it did — and those are not
-- always the same people. Two tables would be two lists to keep in step and a
-- person who does both entered twice; two flags on one row is the same list
-- read two ways.
--
-- Everybody here today raises invoices, which is what the table meant, so
-- `bills` defaults true and the existing rows keep their job. Nobody has been
-- sent a P&L by the portal yet, so `reads_pnl` starts false and is opted into
-- deliberately: these are the numbers with pay and margin in them, and the
-- one way that goes wrong is somebody being added to a list they were never
-- meant to be on.
alter table public.billing_recipients
  add column if not exists bills     boolean not null default true,
  add column if not exists reads_pnl boolean not null default false;

comment on column public.billing_recipients.bills is
  'Raises our invoices: gets the handoff email and the tokenised queue. A row with this false has no business on /billing/<token> and is refused there.';

comment on column public.billing_recipients.reads_pnl is
  'Gets a course''s numbers when we send them — costs, pay, margin, net. Opt-in, and separate from billing on purpose.';
