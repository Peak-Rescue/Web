-- Security hardening pass.
--
-- Two problems, fixed together because fixing either alone is unsafe:
--
--  1. "profiles: own update" was `for update using (auth.uid() = id)` with no
--     WITH CHECK and a table-wide UPDATE grant, so the policy pinned WHICH ROW
--     you may write but not WHICH COLUMNS. A signed-in user could PATCH their
--     own row over the REST API setting role='admin' (also is_exempt, which
--     governs per-diem eligibility, and signature_data_url, the signature
--     stamped onto expense-report PDFs).
--
--  2. Every admin policy written before the is_admin() helper (025) inlines
--     `exists (select 1 from profiles ...)`. On `profiles` itself that is
--     self-recursive: Postgres raises 42P17 on any RLS-subject access. That
--     error is the ONLY thing currently blocking problem 1 — fixing the
--     recursion without closing the column hole would arm the escalation.
--     Elsewhere it means RLS never actually functioned as a backstop.
--
-- The app is unaffected either way: all portal writes go through server
-- actions using the service-role client, which bypasses RLS. These policies
-- are the defense-in-depth layer for anyone hitting PostgREST directly with
-- the anon key.

-- ─── 1. profiles: no self-service writes at all ─────────────────────────────
-- Nothing in the app updates profiles from the browser (verified: every write
-- is a server action on the service-role client), so the safest grant is none.
revoke update on public.profiles from authenticated;
drop policy if exists "profiles: own update" on public.profiles;

-- ─── 2. Kill the recursion: admin checks go through is_admin() ──────────────
-- is_admin() is security definer, so its read of profiles bypasses RLS.

drop policy if exists "profiles: admin read all" on public.profiles;
create policy "profiles: admin read all"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "certs: admin full access" on public.instructor_certs;
create policy "certs: admin full access"
  on public.instructor_certs for all
  using (public.is_admin());

drop policy if exists "cert-docs: admin full access" on public.instructor_cert_documents;
create policy "cert-docs: admin full access"
  on public.instructor_cert_documents for all
  using (public.is_admin());

drop policy if exists "courses: admin full access" on public.courses;
create policy "courses: admin full access"
  on public.courses for all
  using (public.is_admin());

drop policy if exists "instances: admin full access" on public.course_instances;
create policy "instances: admin full access"
  on public.course_instances for all
  using (public.is_admin());

drop policy if exists "instance_instructors: admin full access" on public.instance_instructors;
create policy "instance_instructors: admin full access"
  on public.instance_instructors for all
  using (public.is_admin());

drop policy if exists "enrollments: admin full access" on public.enrollments;
create policy "enrollments: admin full access"
  on public.enrollments for all
  using (public.is_admin());

drop policy if exists "modules: admin full access" on public.course_modules;
create policy "modules: admin full access"
  on public.course_modules for all
  using (public.is_admin());

drop policy if exists "items: admin full access" on public.course_items;
create policy "items: admin full access"
  on public.course_items for all
  using (public.is_admin());

drop policy if exists "off_days: admin full access" on public.instance_off_days;
create policy "off_days: admin full access"
  on public.instance_off_days for all
  using (public.is_admin());

drop policy if exists "contact: admin read" on public.contact_submissions;
create policy "contact: admin read"
  on public.contact_submissions for select
  using (public.is_admin());

drop policy if exists "contact: admin update" on public.contact_submissions;
create policy "contact: admin update"
  on public.contact_submissions for update
  using (public.is_admin());

drop policy if exists "gallery: admin insert" on public.gallery_images;
create policy "gallery: admin insert"
  on public.gallery_images for insert
  with check (public.is_admin());

drop policy if exists "gallery: admin update" on public.gallery_images;
create policy "gallery: admin update"
  on public.gallery_images for update
  using (public.is_admin());

drop policy if exists "gallery: admin delete" on public.gallery_images;
create policy "gallery: admin delete"
  on public.gallery_images for delete
  using (public.is_admin());

-- "courses: instructors read" also inlines a profiles read (role in
-- ('admin','instructor')); route it through a security-definer helper too.
create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'instructor')
  )
$$;

drop policy if exists "courses: instructors read" on public.courses;
create policy "courses: instructors read"
  on public.courses for select
  using (public.is_staff());

-- ─── 3. instructors: no anonymous access ───────────────────────────────────
-- Was `using (true)` plus a table-wide select grant to anon, so anyone with
-- the (public) anon key could dump the full staff roster: work AND personal
-- emails, inactive people, and who has an unaccepted invite — a ready-made
-- phishing list. The public /team pages read through the service-role client
-- (app/team/page.tsx, app/team/[slug]/page.tsx), and no browser-side code
-- reads this table, so anon needs nothing here.
revoke select on public.instructors from anon;
drop policy if exists "instructors: public read" on public.instructors;

-- Signed-in staff keep read access (RLS backstop for the portal's own views);
-- a signed-in student can still only see who is published on the team page.
create policy "instructors: staff read"
  on public.instructors for select
  to authenticated
  using (public.is_staff() or (active and show_on_team_page));
