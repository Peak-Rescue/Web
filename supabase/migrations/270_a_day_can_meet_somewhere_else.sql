-- A day's typed words were the meeting place, and they beat any meetup the
-- day or its canyon pointed at. So a note about the morning — the gate code,
-- who is driving — hid the pin it was a note about, and a day that had picked
-- a meetup could still be quietly answered by a stale copy of its directions.
--
-- The words are now a note beside the place. A one-off spot — the gas
-- station, the shop — is still typed rather than filed, and this flag is what
-- says the words are the place rather than a note about the usual one.
alter table schedule_days
  add column if not exists meets_elsewhere boolean not null default false;

-- Keep every day reading what it read yesterday: typed words on a day that
-- picked no meetup, at a canyon that has one, were a one-off spot.
update schedule_days d
   set meets_elsewhere = true
  from sites s
 where d.site_id = s.id
   and s.meeting_point_id is not null
   and d.meeting_point_id is null
   and nullif(trim(d.meeting_point), '') is not null;
