-- 1) "quoted" course status: more than tentative, less than confirmed —
--    a quote is out and we're waiting on the client.
alter type instance_status add value if not exists 'quoted' after 'tentative';

-- 2) Documents attached to course tasks (signed contracts, permits, gear
--    order confirmations…). Files live in a private bucket; all access goes
--    through server-minted signed URLs, so no storage policies are opened.

create table if not exists public.course_task_documents (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  task_id      uuid not null references public.course_tasks on delete cascade,
  path         text not null,
  filename     text,
  uploaded_by  uuid references public.profiles on delete set null
);

alter table public.course_task_documents enable row level security;

-- Same visibility as the task itself: admins, the assignee, the course team.
drop policy if exists "task_documents: team read" on public.course_task_documents;
create policy "task_documents: team read"
  on public.course_task_documents for select
  using (exists (
    select 1 from public.course_tasks t
    where t.id = task_id and (
      public.is_admin()
      or t.assigned_to = auth.uid()
      or exists (
        select 1 from public.instance_instructors ii
        join public.instructors i on i.id = ii.instructor_id
        where ii.instance_id = t.instance_id and i.profile_id = auth.uid()
      )
    )
  ));

grant select, insert, update, delete on public.course_task_documents to authenticated;

insert into storage.buckets (id, name, public)
values ('task-documents', 'task-documents', false)
on conflict (id) do nothing;
