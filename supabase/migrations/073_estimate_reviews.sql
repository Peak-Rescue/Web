-- Estimate reviews: one admin asks another to look over a course's price
-- estimate. The reviewer gets an email link to the course page, where they
-- can approve or leave notes (or just edit the estimate directly).

create table if not exists public.estimate_reviews (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  instance_id   uuid not null references public.course_instances(id) on delete cascade,
  requested_by  uuid not null references public.profiles(id) on delete cascade,
  reviewer_id   uuid not null references public.profiles(id) on delete cascade,
  note          text,
  responded_at  timestamptz,
  approved      boolean,
  response_note text
);

create index if not exists estimate_reviews_instance_idx
  on public.estimate_reviews (instance_id);

alter table public.estimate_reviews enable row level security;

drop policy if exists "estimate_reviews: admin all" on public.estimate_reviews;
create policy "estimate_reviews: admin all"
  on public.estimate_reviews for all using (public.is_admin());

grant select, insert, update, delete on public.estimate_reviews to authenticated;
