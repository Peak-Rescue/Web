-- General course documents: files attached to the course as a whole
-- (contracts, site maps, client paperwork) rather than to a specific task.
-- Files live in the private task-documents bucket under courses/<instance>/;
-- all access goes through server-minted signed URLs.

create table if not exists public.course_documents (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  instance_id  uuid not null references public.course_instances on delete cascade,
  path         text not null,
  filename     text,
  uploaded_by  uuid references public.profiles on delete set null
);

alter table public.course_documents enable row level security;

-- Admins and the course team can read; writes go through server actions.
drop policy if exists "course_documents: team read" on public.course_documents;
create policy "course_documents: team read"
  on public.course_documents for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = course_documents.instance_id
        and i.profile_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.course_documents to authenticated;
