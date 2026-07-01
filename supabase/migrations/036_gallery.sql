-- Gallery images shown on the public /gallery page, managed by admins in the portal.
-- Uploads go through the service-role client (bypasses RLS); the bucket is public
-- so images render on the website.

create table if not exists public.gallery_images (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  url         text not null,
  caption     text,
  sort_order  int not null default 0
);

alter table public.gallery_images enable row level security;

-- Public gallery → anyone can read.
drop policy if exists "gallery: public read" on public.gallery_images;
create policy "gallery: public read"
  on public.gallery_images for select using (true);

-- Only admins write (the server actions also use the service role).
drop policy if exists "gallery: admin insert" on public.gallery_images;
create policy "gallery: admin insert"
  on public.gallery_images for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "gallery: admin update" on public.gallery_images;
create policy "gallery: admin update"
  on public.gallery_images for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "gallery: admin delete" on public.gallery_images;
create policy "gallery: admin delete"
  on public.gallery_images for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Public storage bucket for the images.
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;
