-- Not everybody works the whole course.
--
-- 195 priced every person against the course's own dates: a travel day each
-- side and every day in between, ten hours each. That is the shape of most
-- people's week and nobody's exactly. Somebody flies in a day late, somebody
-- leaves after the practical, somebody drives when the rest fly, a travel day
-- to another continent is sixteen hours and not ten.
--
-- Those are not corrections to make afterwards on four written lines. They
-- are what the person actually worked, and the arithmetic — which hours are
-- past forty, and therefore what the course owes — depends on them. Somebody
-- arriving on the Tuesday moves two of their days into a week that has room
-- for them, and the premium moves with it.
--
-- So the row that already holds what this course pays them holds the rest of
-- the terms too. Every column is nullable and null means "the course's own
-- answer": only the exceptions are stored, so a crew that all worked the same
-- week has one rate each and nothing else.

alter table public.course_pay_rates
  add column if not exists starts_at     date,
  add column if not exists ends_at       date,
  add column if not exists travel_days   int check (travel_days >= 0 and travel_days <= 10),
  add column if not exists hours_per_day numeric(5,2) check (hours_per_day > 0 and hours_per_day <= 24);

comment on table public.course_pay_rates is
  'What this course pays each person, and for which days. The rate is here because it follows the role and the course type; the dates and hours are here because the person''s own week is what the overtime arithmetic runs on. Null columns follow the course.';

comment on column public.course_pay_rates.starts_at is
  'Their first field day, when it is not the course''s. Null = the course''s first day.';

comment on column public.course_pay_rates.ends_at is
  'Their last field day, when it is not the course''s. Null = the course''s last day.';

comment on column public.course_pay_rates.travel_days is
  'How many travel days they were paid for. Null = two, one each way, which is what the estimate assumes. Odd numbers put the extra one on the way out.';

comment on column public.course_pay_rates.hours_per_day is
  'Hours in each of their days, when it is not the standard ten — an international travel day, a short day. Null = the org-wide figure.';
