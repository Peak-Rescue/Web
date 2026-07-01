-- Submissions from the public /contact form.
-- Inserts happen server-side via the service-role client (which bypasses RLS),
-- so there is intentionally no public INSERT policy. Admins can read.

create table if not exists public.contact_submissions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  first_name   text not null,
  last_name    text not null,
  email        text not null,
  organization text,
  interest     text,
  message      text not null,
  archived     boolean not null default false
);

alter table public.contact_submissions enable row level security;

drop policy if exists "contact_submissions: admin read" on public.contact_submissions;
create policy "contact_submissions: admin read"
  on public.contact_submissions for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "contact_submissions: admin update" on public.contact_submissions;
create policy "contact_submissions: admin update"
  on public.contact_submissions for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
