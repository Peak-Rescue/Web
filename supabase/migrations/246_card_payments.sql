-- Taking a card through Square.
--
-- One table for every kind of thing that can be paid for, because quotes are
-- only the first: gear orders and course sign-ups are expected to follow, and
-- each is the same three facts — what is being paid for, how much was asked,
-- and what Square says happened. `kind` names the thing; each kind gets its own
-- nullable foreign key rather than a polymorphic id, so a deleted quote is a
-- real constraint and not a dangling uuid.
--
-- Square holds the card and the money. All we keep is the ids that let us ask
-- it again, and the answer it gave. A row is opened before the checkout link
-- exists (its id is the idempotency key Square sees), and completed once —
-- `status = 'open'` is the guard that keeps a webhook retry and the client's
-- own return to the page from both handing the same payment to Harken.
create table if not exists public.payments (
  id                     uuid primary key default gen_random_uuid(),
  kind                   text not null check (kind in ('quote')),
  instance_id            uuid references public.course_instances(id) on delete set null,
  quote_id               uuid references public.course_quotes(id) on delete set null,

  -- What was asked for, snapshotted when the link was made.
  amount                 numeric(12,2) not null,
  status                 text not null default 'open' check (status in ('open', 'completed', 'cancelled')),

  square_payment_link_id text,
  square_order_id        text unique,
  checkout_url           text,

  -- What Square says arrived.
  square_payment_id      text unique,
  amount_paid            numeric(12,2),
  receipt_url            text,
  payer_email            text,
  paid_at                timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists payments_quote_idx    on public.payments (quote_id);
create index if not exists payments_instance_idx on public.payments (instance_id);

comment on table public.payments is
  'Card payments taken through Square. One row per checkout link; completed exactly once.';

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
  before update on public.payments
  for each row execute procedure set_updated_at();

-- A handoff that was paid before Harken ever saw it. The request still goes to
-- them — they keep the books — but it arrives paid, and this says by what.
alter table public.invoice_requests
  add column if not exists payment_id uuid references public.payments(id) on delete set null;

comment on column public.invoice_requests.payment_id is
  'Set when the client paid by card through the portal: the request was raised already paid, by the payment itself.';

-- Admin-only backstop, as with invoice_requests. Every real path is a server
-- action or the Square webhook on the service-role client.
alter table public.payments enable row level security;
drop policy if exists "payments: admin" on public.payments;
create policy "payments: admin" on public.payments for all using (public.is_admin());
grant select, insert, update, delete on public.payments to authenticated;
