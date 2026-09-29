-- "Lead" was two facts wearing one word, and they have come apart.
--
-- What instance_instructors.role has meant until now is both "this person is
-- paid the lead rate" and "this person is running the course" — which held
-- only while every course had exactly one lead. It does not hold: a course can
-- carry three people on lead wage and one of them is in charge that week, and
-- the code that gates a course's tasks, checks a course is ready to run, and
-- tells a student who is running their course has been reading a wage to
-- answer a question about authority.
--
-- So the two facts get two columns, and neither derives from the other. Being
-- in charge is not restricted to lead wage — a strong assist runs a course
-- now and then, and the roster should be able to say so rather than force a
-- raise to describe it.

-- ─── Who is actually in charge ──────────────────────────────────────────────

alter table public.instance_instructors
  add column if not exists in_charge boolean not null default false;

comment on column public.instance_instructors.in_charge is
  'Whether this person is running the course in the field. Any number of the crew can be, and they need not be on lead wage. Separate from role, which is only what they are paid.';

-- Every course keeps exactly the lead it had: nothing loses its authority, no
-- task becomes un-closeable, and no course suddenly reads as unready on the
-- morning this lands. Courses staffed later say who is in charge themselves.
update public.instance_instructors set in_charge = true where role = 'lead';

-- ─── The wage category is the wage ──────────────────────────────────────────
-- 195 made the rates a library keyed by the number itself, deliberately: two
-- rows both saying $40 would be one rate entered twice. That stays true. What
-- it could not say is which category each number *is*, so every person's rate
-- was typed per course from memory (196 having removed the standing rate,
-- correctly — the rate follows the role, and the role is per course).
--
-- Naming the categories closes that loop: how somebody is staffed now supplies
-- the rate the actuals suggest, and course_pay_rates goes on holding only the
-- exceptions.

alter table public.pay_field_rates
  add column if not exists role instructor_instance_role;

comment on column public.pay_field_rates.role is
  'The staffing category this rate is the wage for. One active rate per category — that is what makes a course''s crew list able to price itself. Null on a rate that is not a category''s standing wage: a one-off somebody was put on, kept so the courses already priced at it still show a rate that exists.';

-- A raise stays a row, not a migration: the old rate is deactivated and a new
-- one inserted, so only one rate per category is ever on offer while every
-- course already priced at the old one still names a rate that exists.
create unique index if not exists pay_field_rates_one_active_per_role
  on public.pay_field_rates (role) where (active and role is not null);

-- The three numbers that have been in the library since 195, now saying which
-- is which. $25 was already the shadowing rate in everything but name.
update public.pay_field_rates set role = 'lead'   where hourly = 50;
update public.pay_field_rates set role = 'assist' where hourly = 40;
update public.pay_field_rates set role = 'shadow' where hourly = 25;
