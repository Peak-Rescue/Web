-- Fall protection and rope access were one offering, 'fall-protection-rope-access',
-- titled "Fall Protection & Rope Access" but shortened to "Rope Access"
-- everywhere a course names itself — so every fall protection course we have
-- run has been calling itself a rope access course on calendars, quotes and
-- staffing emails. They are two products: a 2-day fall protection class for
-- anyone exposed to a fall, and a SPRAT course for technicians who work on
-- rope.
--
-- Five courses carry the retired slug. Four are unambiguous from their notes;
-- the two PAR Montana courses at PTI go to rope access by default and get
-- re-tagged by hand once confirmed, which is a one-field edit in the course
-- editor.
--
-- Nothing else is tagged with it: gear lists, schedules, course templates,
-- library defaults and task templates were all checked and hold no rows on
-- this slug.
--
-- Runs after the code that knows both new slugs is deployed. That code also
-- still recognises the retired one (lib/courses.ts RETIRED_COURSE_TYPES,
-- lib/capabilities.ts), so a course is never nameless or invisible in
-- between, in either order.

-- "Fall protection train the trainer - 7am time start - 330pm 15people"
update public.course_instances
set course_type = 'fall-protection'
where course_type = 'fall-protection-rope-access'
  and ref_number = 28;

-- PR-0026 and PR-0032 are Jardine Construction SPRAT level 1 cohorts;
-- PR-0033 and PR-0036 are PAR Montana at PTI, provisional (see above).
update public.course_instances
set course_type = 'rope-access'
where course_type = 'fall-protection-rope-access';

-- Everyone signed off on the combined offering is signed off on both halves of
-- it — the split describes the products, not a change in who can teach them.
-- Expanded in place rather than appended, so a bio's specialties stay in the
-- order they were curated in.
update public.instructors i
set specialties = expanded.arr
from (
  select src.id, array_agg(e.x order by u.ord, e.sub_ord) as arr
  from public.instructors src,
       lateral unnest(src.specialties) with ordinality as u(sp, ord),
       lateral unnest(
         case when u.sp = 'fall-protection-rope-access'
              then array['fall-protection', 'rope-access']
              else array[u.sp] end
       ) with ordinality as e(x, sub_ord)
  where 'fall-protection-rope-access' = any (src.specialties)
  group by src.id
) expanded
where i.id = expanded.id;
