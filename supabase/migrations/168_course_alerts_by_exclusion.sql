-- New-course alerts, said the way the screen says it.
--
-- 167 had a master on/off plus two "empty means everything" lists, which put
-- two different meanings on an unticked box: unticked-and-alone meant every
-- discipline, unticked-beside-a-ticked-one meant not that one. Now every box
-- starts ticked and ticked means "send me this", which is the only reading
-- anybody tries first. Unticking every box in a group is how alerts go off,
-- so the separate switch has nothing left to do.
--
-- Stored as what is *un*ticked rather than what is ticked, which is the part
-- that isn't visible on screen. A stored list of wanted disciplines is a list
-- frozen on the day it was saved: when a twelfth discipline is added, nobody's
-- saved list contains it and every admin quietly stops hearing about a whole
-- category. Stored as exclusions, a new discipline is on for everyone until
-- somebody says otherwise — which is the safe direction for a notification to
-- fail in.
--
-- Every row is still the default '{}' from 167, and '{}' means the same thing
-- under both readings — everything — so no data has to be converted.

alter table public.instructors
  drop column if exists course_alerts;

alter table public.instructors
  rename column course_alert_disciplines to course_alert_muted_disciplines;

alter table public.instructors
  rename column course_alert_sectors to course_alert_muted_sectors;

comment on column public.instructors.course_alert_muted_disciplines is
  'Admins only: capability categories NOT to alert about. Empty = every discipline. All of them = alerts off.';
comment on column public.instructors.course_alert_muted_sectors is
  'Admins only: client sectors NOT to alert about (civilian, military). Empty = both. Both = alerts off.';
