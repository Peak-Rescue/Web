-- Client-facing quotes, generated from the internal estimate. Lump-sum
-- presentation (the breakdown stays internal), numbered per course
-- (PR-0007-Q1, Q2…), with the acceptance-token plumbing for the future
-- click-to-accept page. Admin-only, like all financials.

create table if not exists public.course_quotes (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  instance_id        uuid not null references public.course_instances on delete cascade,
  quote_seq          int not null,
  status             text not null default 'draft'
                       check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  issue_date         date not null default current_date,
  valid_until        date,
  total              numeric(12,2) not null default 0,
  unit_rate_note     text,
  scope_bullets      text[],
  course_blurb       text,
  prepared_by        uuid references public.profiles on delete set null,
  prepared_by_name   text,
  prepared_by_email  text,
  accept_token       uuid not null default gen_random_uuid(),
  sent_at            timestamptz,
  viewed_at          timestamptz,
  accepted_at        timestamptz,
  accepted_name      text,
  accepted_title     text,
  accepted_ip        text,
  declined_at        timestamptz,
  unique (instance_id, quote_seq)
);

create unique index if not exists course_quotes_token_idx on public.course_quotes (accept_token);

alter table public.course_quotes enable row level security;

drop policy if exists "course_quotes: admin all" on public.course_quotes;
create policy "course_quotes: admin all"
  on public.course_quotes for all using (public.is_admin());

grant select, insert, update, delete on public.course_quotes to authenticated;
