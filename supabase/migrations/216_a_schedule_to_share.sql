-- A calendar of your own courses, for someone who is not on the crew.
--
-- The three course calendars are for people inside the company, and the
-- per-person Google invites are opt-out precisely because most of us already
-- subscribe to those and do not want the course twice. Between them there is
-- no answer to the ordinary question a partner asks — which weeks is he gone
-- — because nobody outside Peak Rescue can be handed a Google calendar full
-- of client names.
--
-- So: a feed of one person's own field days, at an unguessable URL they hand
-- out themselves. The token is a column rather than a table because there is
-- exactly one per person and it has no history worth keeping: rotating it is
-- how you revoke the old link, and null means there is no link at all, which
-- is what everyone starts as. Only the people who ask for one get one.

alter table public.instructors
  add column if not exists schedule_token uuid;

create unique index if not exists instructors_schedule_token_idx
  on public.instructors (schedule_token)
  where schedule_token is not null;

comment on column public.instructors.schedule_token is
  'Secret for this person''s shared schedule feed (/calendar/<token>.ics). Null = they have never made one. Rotating it revokes every copy of the old URL at once, which is the only revocation an unauthenticated feed can have.';
