-- What the course actually cost, beside what we guessed it would.
--
-- The estimator (044) answers "what should we charge for this?" and the quote
-- answers "what did we tell them?". Neither answers "what did we keep?" —
-- that lived in a per-course spreadsheet with a chart of accounts down one
-- side, and it is the thing the year's profit and loss is built out of.
--
-- Three sources of cost, deliberately kept apart:
--
--  1. Expense reports (039). Pulled live by query, never copied in. A report
--     corrected next week has to move the course's net, and a snapshot would
--     silently stop matching. Only submitted reports count; drafts are shown
--     as a pending figure and left out of the total, so the net does not jump
--     the day somebody finally files.
--
--  2. Company-card spending that was never expensed for reimbursement —
--     which in practice is most of what goes in here. Typed as cost items.
--
--  3. Instructor pay, which has no source anywhere in the app: there is no
--     hours feed and no pay rate on a person. Typed as pay items, with a
--     suggestion offered from the course's own length and the library's pay
--     rates. Payroll load (taxes, insurance, admin) is a percentage on top.
--
-- Invoiced is its own number, not the accepted quote. Gear bought on the
-- client's behalf, an invoice split in two, a renegotiation after the fact —
-- the accepted quote is where the conversation started, so it is offered as a
-- suggestion and nothing more.
--
-- Admin-only throughout, like everything else on the pricing page.

-- ─── Chart of accounts ──────────────────────────────────────────────────────
-- A library, not an enum. The accounts on the old spreadsheet are where this
-- starts, but what a course spends money on changes faster than a migration
-- can — a new account is a row, and renaming one must not orphan the costs
-- filed under it.

create table if not exists public.cost_accounts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  label       text not null,
  -- Expense-report categories that land here by default. An 'other' line can
  -- be reassigned per item (see expense_item_accounts) because 'other' is the
  -- catch-all that covers half this chart.
  categories  text[] not null default '{}',
  sort_order  int not null default 0,
  active      boolean not null default true
);

comment on table public.cost_accounts is
  'What a course spends money on. Editable library: expense-report money routes here by category, typed costs by choice.';

insert into public.cost_accounts (label, categories, sort_order)
values
  ('Travel expenses', array['air_fare','auto_rental','transport','personal_auto','lodging','per_diem','breakfast','lunch','dinner'], 10),
  ('Materials',      '{}', 20),
  ('Gear shipping',  '{}', 30),
  ('Marketing',      '{}', 40),
  ('SWAG',           '{}', 50),
  ('Evaluator fees', '{}', 60),
  ('SPRAT fees',     '{}', 70),
  -- Where an unassigned 'other' expense line sits until somebody moves it.
  ('Misc',           array['other'], 80)
on conflict do nothing;

-- ─── Pay rates: what we quote vs what we pay ────────────────────────────────
-- The estimator prices an instructor day at a padded number on purpose. Pay
-- is the real one. Same library row carries both, because they are two facts
-- about one thing and a second table would drift from the first.

alter table public.pricing_rates
  add column if not exists pay_rate numeric(10,2);

comment on column public.pricing_rates.pay_rate is
  'What a person is actually paid for this line, where that differs from the rate we quote at (which is padded). Null on lines that are not somebody''s time.';

update public.pricing_rates set pay_rate = 500 where active and label = 'Instructor field day' and pay_rate is null;
update public.pricing_rates set pay_rate = 200 where active and label = 'Instructor travel day' and pay_rate is null;

-- ─── The course's actuals ───────────────────────────────────────────────────

create table if not exists public.course_actuals (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  instance_id       uuid not null unique references public.course_instances on delete cascade,
  -- What we actually billed. Null = nobody has said yet; the accepted quote
  -- stands in as a suggestion in the panel, never as a value.
  invoiced          numeric(12,2),
  -- Taxes, insurance and the rest, as a multiplier on pay. Per course because
  -- the number is a running assumption, not a fact of the org.
  payroll_load_pct  numeric(5,4) not null default 0.25 check (payroll_load_pct >= 0),
  notes             text,
  -- The books are done. Nothing is locked by it; it says the number is final
  -- so a year-end total knows which courses are still moving.
  closed_at         timestamptz
);

-- Somebody's time on this course. No source to pull from — there is no hours
-- feed and no rate on a person — so these are typed, with the panel offering
-- a suggestion built from the course's length and the library's pay rates.
create table if not exists public.course_pay_items (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  instance_id  uuid not null references public.course_instances on delete cascade,
  -- Who, when it is somebody on the roster. Optional: a single "Team pay"
  -- line for the whole crew is how this was done on paper and still valid.
  profile_id   uuid references public.profiles on delete set null,
  work_date    date,
  description  text,
  amount       numeric(10,2) not null default 0,
  sort_order   int not null default 0
);

-- Money spent on the course that no expense report will ever carry: the
-- company card, an invoice paid directly, a deposit on a venue.
create table if not exists public.course_cost_items (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  instance_id  uuid not null references public.course_instances on delete cascade,
  account_id   uuid references public.cost_accounts on delete set null,
  spend_date   date,
  description  text,
  amount       numeric(10,2) not null default 0,
  sort_order   int not null default 0
);

-- Where one expense line belongs, when its category's default account is
-- wrong. Only the exceptions are stored — an unlisted line follows its
-- category. Keyed on the item so a deleted expense takes its filing with it.
create table if not exists public.expense_item_accounts (
  expense_item_id  uuid primary key references public.expense_items on delete cascade,
  account_id       uuid not null references public.cost_accounts on delete cascade,
  created_at       timestamptz not null default now()
);

create index if not exists course_pay_items_instance_idx on public.course_pay_items (instance_id);
create index if not exists course_cost_items_instance_idx on public.course_cost_items (instance_id);

-- ─── RLS: admin eyes only, same as the estimator ────────────────────────────

alter table public.cost_accounts enable row level security;
alter table public.course_actuals enable row level security;
alter table public.course_pay_items enable row level security;
alter table public.course_cost_items enable row level security;
alter table public.expense_item_accounts enable row level security;

drop policy if exists "cost_accounts: admin all" on public.cost_accounts;
create policy "cost_accounts: admin all" on public.cost_accounts for all using (public.is_admin());

drop policy if exists "course_actuals: admin all" on public.course_actuals;
create policy "course_actuals: admin all" on public.course_actuals for all using (public.is_admin());

drop policy if exists "course_pay_items: admin all" on public.course_pay_items;
create policy "course_pay_items: admin all" on public.course_pay_items for all using (public.is_admin());

drop policy if exists "course_cost_items: admin all" on public.course_cost_items;
create policy "course_cost_items: admin all" on public.course_cost_items for all using (public.is_admin());

drop policy if exists "expense_item_accounts: admin all" on public.expense_item_accounts;
create policy "expense_item_accounts: admin all" on public.expense_item_accounts for all using (public.is_admin());

-- ─── Explicit grants (see 029_explicit_grants.sql) ──────────────────────────

grant select, insert, update, delete on public.cost_accounts to authenticated;
grant select, insert, update, delete on public.course_actuals to authenticated;
grant select, insert, update, delete on public.course_pay_items to authenticated;
grant select, insert, update, delete on public.course_cost_items to authenticated;
grant select, insert, update, delete on public.expense_item_accounts to authenticated;
