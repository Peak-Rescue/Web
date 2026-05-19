-- Supabase is removing implicit public-schema grants (new projects May 30 2026,
-- all projects Oct 30 2026). Explicit grants are required for the Data API
-- (supabase-js / PostgREST) to access tables. RLS policies still control what
-- each role can actually read or write.

-- ─── Public tables (anon-readable) ───────────────────────────────────────────

grant select on public.instructors to anon;

-- ─── Authenticated-only tables ────────────────────────────────────────────────

grant select, update
  on public.profiles
  to authenticated;
-- insert handled by the handle_new_user() trigger (security definer)

grant select, insert, update, delete
  on public.instructor_capabilities
  to authenticated;

grant select, insert, update, delete
  on public.instructor_certs
  to authenticated;

grant select, insert, update, delete
  on public.instructor_cert_documents
  to authenticated;

grant select, insert, update, delete
  on public.courses
  to authenticated;

grant select, insert, update, delete
  on public.course_instances
  to authenticated;

grant select, insert, update, delete
  on public.instance_instructors
  to authenticated;

grant select, insert, update, delete
  on public.enrollments
  to authenticated;

grant select, insert, update, delete
  on public.course_modules
  to authenticated;

grant select, insert, update, delete
  on public.course_items
  to authenticated;

grant select, insert, update, delete
  on public.instance_off_days
  to authenticated;

grant select, insert, update, delete
  on public.instructors
  to authenticated;
