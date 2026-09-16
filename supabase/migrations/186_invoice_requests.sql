-- Handing a course off to Harken to be billed.
--
-- The step this closes is the one that has always happened in someone's inbox:
-- a quote is accepted, and a person emails the biller what to charge and who
-- to charge it to. That email is a fine way to *notify*, and a terrible place
-- to *keep* the fact — nobody can answer "was PR-0042 ever billed?" by
-- searching a mailbox, and nothing that lives only in a thread can be resent.
-- So the request is a row, and the mail is a rendering of it, the same bargain
-- the expense report makes with its PDF.
--
-- Two tables, because the question "who at Harken" and the question "what do
-- we owe them" change on completely different clocks. Kallie will be replaced
-- one day; the 40 invoices she raised are not hers to take with her.

-- ─── Who at Harken ───────────────────────────────────────────────────────────
--
-- A row rather than an env var, which is what this started as. An address in
-- the environment can be changed, but only by someone with a Vercel login and
-- a deploy, and it can hold exactly one person — neither of which survives
-- "Kallie's out, send it to Dana too". A table makes adding a biller an admin
-- click, and deactivating one instant.
--
-- No login, and deliberately so. A Harken biller is not a student, not an
-- instructor and not an admin — the three roles this portal has — and minting
-- accounts for an outside firm buys an offboarding problem in exchange for
-- nothing. Worse, auth mail from supabase.co is already known to be dropped by
-- corporate mail filters, so an account could be one that cannot be signed
-- into from the building where the work happens. The token is the whole gate,
-- exactly as it is for the quote, the gear order and the shared actuals page.
create table if not exists public.billing_recipients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  org        text not null default 'Harken',
  -- Their standing link. Not per-request: a biller works a queue, and one
  -- address they can bookmark beats hunting for whichever email carried the
  -- invoice they are looking at. Rotate by writing a new uuid here; revoke by
  -- clearing `active`, which takes the link down without touching history.
  token      uuid not null default gen_random_uuid(),
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_recipients_token_idx on public.billing_recipients (token);
create index if not exists billing_recipients_active_idx on public.billing_recipients (active) where active;

comment on table public.billing_recipients is
  'People at Harken who raise our invoices. Each holds a standing token; any active one can work the whole queue.';
comment on column public.billing_recipients.token is
  'The gate for /billing/<token>. Rotate by replacing it; revoke by setting active = false.';

insert into public.billing_recipients (name, email)
select 'Kallie Hunt', 'kallie.hunt@harken.com'
where not exists (select 1 from public.billing_recipients where lower(email) = 'kallie.hunt@harken.com');

-- ─── What to bill, and who to bill ───────────────────────────────────────────
--
-- Every fact the biller needs is copied in, not joined. A request is the thing
-- Harken acted on, and it must read a year from now exactly as it read the day
-- it was sent — a corrected POC or a renegotiated total changing an invoice
-- that has already been raised is how a reconciliation goes wrong. The same
-- reason a gear order keeps its own lines rather than pointing at the list.
--
-- Which also settles what happens when the number moves after the fact. A cut
-- day or a renegotiation is a *second* request, not an edit of the first:
-- Harken has already acted, and the record of what they were told to do is not
-- ours to quietly rewrite.
create table if not exists public.invoice_requests (
  id            uuid primary key default gen_random_uuid(),
  instance_id   uuid not null references public.course_instances(id) on delete cascade,
  -- Provenance. Null if the quote is ever deleted; the request still stands,
  -- because what Harken was told does not stop being true.
  quote_id      uuid references public.course_quotes(id) on delete set null,

  -- What to bill. Snapshotted at send.
  amount        numeric(12,2) not null default 0,
  -- The course in the words the biller needs, so the row reads without a
  -- lookup: "PR-0042 · Canyon Rescue Technician · 24 STS · Mar 3–7".
  description   text,

  -- Who to bill. Snapshotted from the POC tagged `billing` in
  -- course_instances.contacts, plus the client it sits under.
  bill_to_org   text,
  bill_to_name  text,
  bill_to_email text,
  bill_to_phone text,
  -- Anything the biller needs that the fields above have no room for: a PO
  -- number, a portal to submit through, "net 30 from completion".
  bill_to_note  text,

  -- pending  — raised by the accept, waiting on someone to check it and send
  -- sent     — Harken has it
  -- invoiced — Harken says they have raised it
  -- paid     — Harken says the money arrived
  -- cancelled— it should not have gone out, or the course went away
  --
  -- The last two are self-reported and always will be: the portal has no view
  -- into Harken's books, the same honesty the expense report's "payment
  -- received" flag settled on.
  status        text not null default 'pending'
                  check (status in ('pending', 'sent', 'invoiced', 'paid', 'cancelled')),

  sent_at       timestamptz,
  sent_by       uuid references public.profiles(id) on delete set null,
  viewed_at     timestamptz,

  -- Harken's side of it. `invoice_number` is theirs, typed in here; the portal
  -- never generates or validates it.
  invoiced_at     timestamptz,
  invoice_number  text,
  invoiced_by     uuid references public.billing_recipients(id) on delete set null,

  -- Kept apart from `amount` on purpose: a partial payment is a real event,
  -- and folding it into the amount asked for loses the fact that they differ.
  paid_at         timestamptz,
  amount_received numeric(12,2),
  paid_by         uuid references public.billing_recipients(id) on delete set null,

  -- The biller's word on the request as a whole — "client wants it split",
  -- "rejected, wrong PO". Theirs to write, ours to read.
  biller_note   text,
  -- Ours to write, theirs to read.
  admin_note    text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists invoice_requests_instance_idx on public.invoice_requests (instance_id);
create index if not exists invoice_requests_quote_idx    on public.invoice_requests (quote_id);
-- The biller's queue: everything still owed an action, oldest first.
create index if not exists invoice_requests_open_idx
  on public.invoice_requests (created_at)
  where status in ('sent', 'invoiced');

comment on table public.invoice_requests is
  'One handoff to Harken: what to bill and who to bill, snapshotted at send. A changed price is a new request, never an edit of a sent one.';
comment on column public.invoice_requests.amount_received is
  'Self-reported by the biller. The portal cannot see Harken''s books; a partial payment is why this is not just `amount`.';

drop trigger if exists billing_recipients_updated_at on public.billing_recipients;
create trigger billing_recipients_updated_at
  before update on public.billing_recipients
  for each row execute procedure set_updated_at();

drop trigger if exists invoice_requests_updated_at on public.invoice_requests;
create trigger invoice_requests_updated_at
  before update on public.invoice_requests
  for each row execute procedure set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
--
-- Admin-only, as a backstop. Every real path in and out of these tables is a
-- server action on the service-role client: the admin pages, and the token
-- page, which has no session to have a policy about. Instructors are not
-- admins here for a reason — who is billed and for how much is not theirs.
alter table public.billing_recipients enable row level security;
alter table public.invoice_requests   enable row level security;

drop policy if exists "billing_recipients: admin" on public.billing_recipients;
create policy "billing_recipients: admin" on public.billing_recipients for all using (public.is_admin());
drop policy if exists "invoice_requests: admin" on public.invoice_requests;
create policy "invoice_requests: admin"   on public.invoice_requests   for all using (public.is_admin());

grant select, insert, update, delete on public.billing_recipients to authenticated;
grant select, insert, update, delete on public.invoice_requests   to authenticated;
