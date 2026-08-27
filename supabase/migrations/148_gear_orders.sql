-- Sending a gear list out, and getting an order back.
--
-- Two different journeys, both modelled on what the estimate already does:
--
--  1. Internal — one admin asks another to look over a course's gear list,
--     exactly as they already do for the price estimate. Same loop, same
--     table: estimate_reviews grew a subject rather than being copied, because
--     the columns it needs (who asked, who reviews, the note back, approved)
--     are identical and a second table would drift from the first.
--
--  2. Client — the list goes out as a link the client can work on: change how
--     many of a thing they want, drop lines they don't need, and leave notes.
--     What comes back is an order for purchasing.
--
-- The order is a live record, not a document. A PDF is how it goes to
-- purchasing, but the PDF is a rendering of the current state — the client
-- calls back a week later wanting two fewer harnesses, and that is an edit,
-- not a new artefact. Freezing it would make the second pass a retype.
--
-- Lines are snapshotted off the gear list at send time rather than pointing at
-- it: the list keeps being edited for the course it teaches, and an order the
-- client has already responded to must not change under them. entry_id is kept
-- only so a line can be traced back to where it came from.
--
-- No prices yet — this is a needs list, and purchasing quotes it. When the
-- catalogue gains prices, a unit_price column here is additive and the
-- client-facing page grows a total. Nothing about this shape has to change.

alter table public.estimate_reviews
  add column if not exists subject text not null default 'estimate'
    check (subject in ('estimate', 'gear'));

comment on table public.estimate_reviews is
  'One admin asking another to look over part of a course. Named for the estimate because that came first; `subject` says which part.';

create table if not exists public.gear_orders (
  id              uuid primary key default gen_random_uuid(),
  instance_id     uuid not null references public.course_instances(id) on delete cascade,
  -- Which list it was built from, for provenance. The lines are their own copy.
  list_id         uuid references public.gear_lists(id) on delete set null,
  -- Issued by an outside system and typed in here. The portal never generates
  -- or validates it; it just has to reach the client, who quotes it back.
  es_quote_number text,
  status          text not null default 'draft'
                    check (status in ('draft', 'sent', 'responded', 'closed')),
  accept_token    uuid not null default gen_random_uuid(),
  intro           text,
  sent_at         timestamptz,
  viewed_at       timestamptz,
  responded_at    timestamptz,
  responded_name  text,
  responded_title text,
  responded_ip    text,
  -- The client's word on the order as a whole, as opposed to a single line.
  client_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists gear_orders_instance_idx on public.gear_orders (instance_id);
create unique index if not exists gear_orders_token_idx on public.gear_orders (accept_token);

create table if not exists public.gear_order_lines (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.gear_orders(id) on delete cascade,
  -- Where this line came from. Null once the entry is gone; the line survives.
  entry_id    uuid references public.gear_list_entries(id) on delete set null,
  name        text not null,
  detail      text,                        -- the spec we recommended
  category    text,
  -- What we put in front of them, in the gear list's own words ("2", "20 ft").
  qty_offered text,
  -- What they actually want. Null until they answer.
  qty_wanted  numeric(10,2),
  -- Struck out rather than deleted: "they don't want this" is an answer worth
  -- keeping, and a line that vanishes can't be put back when they change their
  -- mind on the second pass.
  removed     boolean not null default false,
  client_note text,
  admin_note  text,
  sort_order  int not null default 0
);

create index if not exists gear_order_lines_order_idx on public.gear_order_lines (order_id, sort_order);

alter table public.gear_orders      enable row level security;
alter table public.gear_order_lines enable row level security;

create policy "gear_orders: admin"      on public.gear_orders      for all using (public.is_admin());
create policy "gear_order_lines: admin" on public.gear_order_lines for all using (public.is_admin());

grant select, insert, update, delete on public.gear_orders      to authenticated;
grant select, insert, update, delete on public.gear_order_lines to authenticated;
