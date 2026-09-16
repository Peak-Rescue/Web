-- The company card's statement, imported and tagged to courses.
--
-- Three kinds of money reach a course's books, and until now only two had a
-- door. Reimbursements arrive on an expense report. Pay is typed, because
-- hours live in ADP. Everything on the company card — which is most of what a
-- course spends — was typed in by hand off a statement somebody had open in
-- another window, which is both the slowest part of reconciling a course and
-- the part that silently misses a charge.
--
-- So the statement itself comes in. A CSV is imported once, every row is kept
-- verbatim, and tagging a row to a course is what puts it in that course's
-- costs. Nothing is copied into the course: the charge is read live, exactly
-- as expense-report money is, so re-tagging a row moves the money instead of
-- leaving a stale copy behind.
--
-- No card's export format is assumed. Which column is the date, which is the
-- amount and which is the description is decided at import time by the person
-- doing it, and the untouched row is kept beside the parsed one so a mapping
-- that turns out wrong can be read back rather than re-downloaded.

-- ─── One import ─────────────────────────────────────────────────────────────
-- Kept as its own row so an import can be described ("September statement"),
-- counted, and undone: deleting a batch takes its charges with it, which is
-- the only safe answer to a file imported with the columns mapped wrong.

create table if not exists public.card_import_batches (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  imported_by   uuid references public.profiles on delete set null,
  -- The file's name, or what the person called the paste.
  source_name   text,
  row_count     int not null default 0,
  -- Rows already in the books from an earlier import. Shown after the import
  -- rather than hidden: overlapping statements are normal, and "40 rows, 12
  -- already here" is the sentence that says the overlap was handled.
  skipped_count int not null default 0
);

-- ─── One charge ─────────────────────────────────────────────────────────────

create table if not exists public.card_charges (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  batch_id     uuid not null references public.card_import_batches on delete cascade,
  posted_date  date not null,
  description  text not null,
  -- Positive is money out. A refund is negative, and it has to stay in the
  -- books as one: a credit against a course is part of what that course cost.
  amount       numeric(12,2) not null,
  -- Whose card, when the export says. Free text because every bank spells it
  -- differently — a name, a last four, a card nickname.
  cardholder   text,
  -- The row exactly as the file had it, by that file's own column names. The
  -- parsed columns above are an interpretation; this is the evidence.
  raw          jsonb not null default '{}'::jsonb,
  -- What makes this charge that charge across two imports of overlapping
  -- statements: date, amount, description, cardholder, and which occurrence
  -- it is within its own file — so two identical coffees on one day are two
  -- charges, while the same statement imported twice is not.
  fingerprint  text not null unique,
  -- Which course's books it lands in. Null and not marked overhead means
  -- nobody has said yet, which is the pile the tagging screen works through.
  instance_id  uuid references public.course_instances on delete set null,
  -- Deliberately nobody's: rent, software, a tool for the shop. The same
  -- distinction expense_items.non_course draws, for the same reason — an
  -- unanswered row and an answered "no course" must not look alike.
  non_course   boolean not null default false,
  account_id   uuid references public.cost_accounts on delete set null,
  note         text
);

create index if not exists card_charges_instance_idx on public.card_charges (instance_id);
create index if not exists card_charges_untagged_idx on public.card_charges (posted_date)
  where instance_id is null and non_course = false;

comment on table public.card_charges is
  'Company-card statement rows. Tagged to a course, read live into that course''s actuals — never copied into a cost line.';

-- ─── Money that is neither on the card nor on a report ──────────────────────
-- A venue deposit paid by check, permits paid by ACH, an evaluator invoiced
-- and paid from the bank. No feed will ever announce those: the card export
-- does not have them and nobody expenses them. They stay typed cost lines,
-- and these two columns are what makes a typed line say so — both so the
-- books can show a check number when Harken asks, and so a typed line is
-- visibly not a card charge somebody entered twice.

alter table public.course_cost_items
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('check', 'ach', 'card', 'other')),
  add column if not exists payment_ref text;

comment on column public.course_cost_items.payment_method is
  'How it was paid, for money that reaches the books through no feed — a check, an ACH, an invoice paid from the bank. Null means nobody said.';

-- ─── RLS: admin eyes only, like the rest of the money ───────────────────────

alter table public.card_import_batches enable row level security;
alter table public.card_charges enable row level security;

drop policy if exists "card_import_batches: admin all" on public.card_import_batches;
create policy "card_import_batches: admin all" on public.card_import_batches for all using (public.is_admin());

drop policy if exists "card_charges: admin all" on public.card_charges;
create policy "card_charges: admin all" on public.card_charges for all using (public.is_admin());

grant select, insert, update, delete on public.card_import_batches to authenticated;
grant select, insert, update, delete on public.card_charges to authenticated;
