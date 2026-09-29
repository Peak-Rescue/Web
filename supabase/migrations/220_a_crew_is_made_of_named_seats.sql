-- How many instructors a course needs was one number, and it could not say
-- what any of them were there to do.
--
-- That number is what an instructor is asked to say yes to when we call for
-- interest, and "we need three people" does not tell somebody whether they are
-- being asked to run the week, work it, or learn it — which is the first thing
-- they want to know and the thing that decides whether they can say yes at all.
-- A lead can work as an assist; an assist cannot cover a lead seat.
--
-- 208 widened this column to numeric so it could hold 1.5, because half an
-- instructor was the only way to price a course that ran with a lead and
-- somebody cheaper alongside them. That was the shadow seat all along, without
-- a name. Now that the seats are named, the fraction has nothing left to say:
-- a crew is a whole number of named people.

alter table public.course_instances
  add column if not exists lead_slots   integer check (lead_slots   is null or lead_slots   >= 0),
  add column if not exists assist_slots integer check (assist_slots is null or assist_slots >= 0),
  add column if not exists shadow_slots integer check (shadow_slots is null or shadow_slots >= 0);

comment on column public.course_instances.lead_slots is
  'How many people the course is planned to run at lead wage. Null = nobody has broken the crew down yet; the plan is then just the head count.';
comment on column public.course_instances.assist_slots is
  'How many assist seats the crew plan has. Null = not broken down.';
comment on column public.course_instances.shadow_slots is
  'How many shadow seats — somebody working the course to learn it. Null = not broken down. Zero and null are different answers: zero says we thought about it and there is no room.';

-- Existing courses, from the only thing they said: how many bodies.
--
-- One lead and the rest assists, because that is the world every one of these
-- rows was created in — a course could only have one lead until 219 — and it is
-- the shape that mis-describes the fewest of them. 1.5 rounds up to two and
-- comes out as a lead plus an assist, which is exactly what somebody meant when
-- they typed it.
--
-- Not a guess at shadows: a shadow seat nobody asked for would go out in a
-- call-out as a seat that exists, and an instructor turning up expecting to
-- learn the course is a worse error than an empty column.
update public.course_instances
set lead_slots   = 1,
    assist_slots = greatest(ceil(instructor_slots)::int - 1, 0),
    shadow_slots = 0
where instructor_slots is not null
  and lead_slots is null and assist_slots is null and shadow_slots is null;

-- instructor_slots stays, and stays the number the estimator quotes off and the
-- readiness chain counts against — but it is now the sum of the seats above,
-- written by whoever writes them. It is not a generated column yet on purpose:
-- a deploy lands after its migrations, and a browser tab open across one goes
-- on running the old build's server actions (Vercel skew), so a column that
-- refused to be written would break course creation for exactly as long as
-- somebody had an old tab open. Converting it is a later migration, once no
-- running code writes it directly.
comment on column public.course_instances.instructor_slots is
  'How many instructors the course is planned around — the sum of lead_slots, assist_slots and shadow_slots, kept in step by the app. What the estimate quotes for and what staffing counts against. Whole people: the fraction 208 allowed for said "a lead and somebody cheaper", which is a shadow seat now and says so.';
