-- Being on a salary and being paid for the days you teach are two questions.
--
-- 198 made them one, and got both people it was about wrong. Nadav is
-- salaried for the admin work and still paid the day rates on top, exempt
-- from the overtime premium but not from the pay. Micah is salaried and not
-- paid for course days at all. One flag could only describe one of them, and
-- it described the wrong one for the other.
--
-- So three facts, each answering something different:
--
--   · salaried        — whether there is a salary at all.
--   · annual_salary   — how much of one. Nothing per-course reads it: a
--                       salary is overhead, and the course it lands against
--                       is "all of them". It is here so the org's own P&L,
--                       when it exists, has somewhere to read it from rather
--                       than a figure kept in somebody's head.
--   · paid_for_days   — whether the field and travel days they work are paid
--                       on top. This is the one the course's pay reads.
--
-- Overtime stays where it was: profiles.is_exempt (039). Exempt says the
-- premium is not theirs, which is a different sentence again from either of
-- these — Nadav is all three of salaried, paid for days, and exempt.

alter table public.instructors
  add column if not exists annual_salary numeric(12,2),
  add column if not exists paid_for_days boolean not null default true;

comment on column public.instructors.salaried is
  'Whether they are on a salary. Says nothing about course pay on its own — see paid_for_days, which is what a course''s pay lines read.';

comment on column public.instructors.annual_salary is
  'What the salary is, for the org''s own profit and loss. No course reads it: a salary is overhead rather than a cost of any one course. Null when nobody has said, or when there is no salary.';

comment on column public.instructors.paid_for_days is
  'Whether the field and travel days they work are paid on top of anything else. False makes their course pay nothing and stops the panel asking for an hourly. True for nearly everybody, salaried or not.';

-- Micah is salaried and not paid for course days; 198 had this part right.
update public.instructors set salaried = true, paid_for_days = false where slug = 'micah-rush';

-- Nadav is salaried for the admin work and paid the day rates as well. The
-- amount is deliberately left null: nobody has said what it is, and a number
-- invented here would be read as one somebody chose.
update public.instructors set salaried = true, paid_for_days = true where slug = 'nadav-oakes';
