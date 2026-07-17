-- Expense reports: replaces the shared "Harken Expense Report" Google Sheet.
-- Instructors file reports in the portal; math (mileage, per diem) is computed
-- server-side from effective-dated rates; submission generates a PDF emailed to
-- accounting. Writes go through the service-role client; RLS is a backstop.

-- ─── Profiles: FLSA exemption + reusable drawn signature ────────────────────

-- Per diem is only available to exempt employees. Admin-set in the portal.
alter table public.profiles
  add column if not exists is_exempt boolean not null default false;

-- Drawn-once signature (PNG data URL), stamped onto generated report PDFs.
alter table public.profiles
  add column if not exists signature_data_url text;

-- ─── Rates (mileage $/mile, per diem $/meal), effective-dated ───────────────

create table if not exists public.expense_rates (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  rate_type       text not null check (rate_type in ('mileage', 'per_diem_meal')),
  rate            numeric(8,4) not null check (rate >= 0),
  effective_date  date not null,
  unique (rate_type, effective_date)
);

insert into public.expense_rates (rate_type, rate, effective_date)
values
  ('mileage', 0.7250, '2026-01-01'),
  ('per_diem_meal', 20.0000, '2026-01-01')
on conflict (rate_type, effective_date) do nothing;

-- ─── Reports ────────────────────────────────────────────────────────────────

create table if not exists public.expense_reports (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  profile_id           uuid not null references public.profiles on delete cascade,
  reason               text,
  status               text not null default 'draft' check (status in ('draft', 'submitted')),
  -- Default course instance; individual items can override for multi-course trips.
  default_instance_id  uuid references public.course_instances on delete set null,
  submitted_at         timestamptz
);

-- ─── Line items ─────────────────────────────────────────────────────────────

create table if not exists public.expense_items (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  report_id        uuid not null references public.expense_reports on delete cascade,
  -- Date range; end_date null = single-day expense.
  start_date       date not null,
  end_date         date check (end_date is null or end_date >= start_date),
  category         text not null check (category in (
                     'air_fare', 'auto_rental', 'transport', 'personal_auto',
                     'lodging', 'breakfast', 'lunch', 'dinner', 'per_diem', 'other')),
  paid_by          text not null default 'personal' check (paid_by in ('personal', 'company_card')),
  description      text,
  -- Detail text required for 'other' and meals paid for others; rendered on PDF page 2.
  details          text,
  paid_for_others  boolean not null default false,
  -- personal_auto: miles driven; per_diem: number of meals covered.
  miles            numeric(8,1) check (miles is null or miles >= 0),
  meal_count       int check (meal_count is null or meal_count >= 0),
  -- Snapshot of the rate applied, so history survives later rate edits.
  rate_used        numeric(8,4),
  amount           numeric(10,2) not null default 0,
  instance_id      uuid references public.course_instances on delete set null,
  sort_order       int not null default 0
);

-- ─── Receipts (files live in the expense-receipts bucket) ───────────────────

create table if not exists public.expense_receipts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  item_id     uuid not null references public.expense_items on delete cascade,
  path        text not null,
  filename    text
);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.expense_rates enable row level security;
alter table public.expense_reports enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_receipts enable row level security;

-- Rates: any signed-in user can read (the form shows live math); admins write.
drop policy if exists "expense_rates: authenticated read" on public.expense_rates;
create policy "expense_rates: authenticated read"
  on public.expense_rates for select
  using (auth.uid() is not null);

drop policy if exists "expense_rates: admin write" on public.expense_rates;
create policy "expense_rates: admin write"
  on public.expense_rates for all
  using (public.is_admin());

-- Reports: owner or admin.
drop policy if exists "expense_reports: own read" on public.expense_reports;
create policy "expense_reports: own read"
  on public.expense_reports for select
  using (profile_id = auth.uid() or public.is_admin());

-- Items/receipts: ownership via the parent report.
drop policy if exists "expense_items: own read" on public.expense_items;
create policy "expense_items: own read"
  on public.expense_items for select
  using (exists (
    select 1 from public.expense_reports r
    where r.id = report_id and (r.profile_id = auth.uid() or public.is_admin())
  ));

drop policy if exists "expense_receipts: own read" on public.expense_receipts;
create policy "expense_receipts: own read"
  on public.expense_receipts for select
  using (exists (
    select 1 from public.expense_items i
    join public.expense_reports r on r.id = i.report_id
    where i.id = item_id and (r.profile_id = auth.uid() or public.is_admin())
  ));

-- ─── Explicit grants (see 029_explicit_grants.sql) ──────────────────────────

grant select on public.expense_rates to authenticated;
grant select, insert, update, delete on public.expense_reports to authenticated;
grant select, insert, update, delete on public.expense_items to authenticated;
grant select, insert, update, delete on public.expense_receipts to authenticated;

-- ─── Private storage bucket for receipt files ───────────────────────────────
-- Path structure: receipts/{user_id}/{report_id}/{uuid}.{ext}

insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

drop policy if exists "expense-receipts: own upload" on storage.objects;
create policy "expense-receipts: own upload"
  on storage.objects for insert
  with check (
    bucket_id = 'expense-receipts' and
    name like 'receipts/' || auth.uid()::text || '/%'
  );

drop policy if exists "expense-receipts: own read" on storage.objects;
create policy "expense-receipts: own read"
  on storage.objects for select
  using (
    bucket_id = 'expense-receipts' and
    name like 'receipts/' || auth.uid()::text || '/%'
  );

drop policy if exists "expense-receipts: own delete" on storage.objects;
create policy "expense-receipts: own delete"
  on storage.objects for delete
  using (
    bucket_id = 'expense-receipts' and
    name like 'receipts/' || auth.uid()::text || '/%'
  );

drop policy if exists "expense-receipts: admin read all" on storage.objects;
create policy "expense-receipts: admin read all"
  on storage.objects for select
  using (
    bucket_id = 'expense-receipts' and
    public.is_admin()
  );
