-- Employee-info links move out of hardcoded JSX so admins can manage them
-- from the portal. Grouped into free-text sections; instructors read via the
-- service-role client, so RLS mirrors the admin-only convention.

create table if not exists public.employee_resources (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  section     text not null default 'Policies & guides',
  title       text not null,
  description text,
  url         text not null,
  sort_order  int not null default 0
);

alter table public.employee_resources enable row level security;

drop policy if exists "employee_resources: admin all" on public.employee_resources;
create policy "employee_resources: admin all"
  on public.employee_resources for all using (public.is_admin());

grant select, insert, update, delete on public.employee_resources to authenticated;

insert into public.employee_resources (section, title, description, url)
values (
  'Policies & guides',
  'Employee Handbook',
  'Company policies, expectations, and general employment information',
  'https://docs.google.com/document/d/1N-vY8RGrITPGrWD1ymQvqoQdMKX1Qela/edit'
);
