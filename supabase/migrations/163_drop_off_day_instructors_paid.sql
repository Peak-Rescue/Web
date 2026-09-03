-- The contract half of 162: pay is a fact about the course now, not about each
-- break, and nothing reads this column any more.
--
-- Held back until the code that stopped selecting it was live. A column the
-- running app still names in a select cannot be dropped — PostgREST fails the
-- query and every course page goes down, which is exactly how this repo lost
-- them once before. Production is serving a7904ba (deployment 513cba4,
-- success) at the time of writing, and nothing in it references the column.
alter table instance_off_days
  drop column if exists instructors_paid;
