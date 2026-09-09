-- An instructor's work email is theirs to hand out too.
--
-- 165 made the phone opt-in and reasoned that email needed no switch: a work
-- address is legible from the address itself, so anything at our own domain
-- can be shown and anything else cannot. True about the address, and not
-- about the person. Somebody with a perfectly good work address can still
-- have a reason not to want eight students mailing it directly for a season,
-- and the domain rule left them nothing to say so with.
--
-- Defaulting to true because that is what the page already does — the column
-- arriving must not quietly take a card's email away from everyone who has
-- one. The domain rule stays in front of it: this switch can only ever hide
-- an address, never promote a personal one.
alter table public.instructors
  add column if not exists show_email boolean not null default true;

comment on column public.instructors.show_email is
  'Whether this instructor''s work email may be shown to students on a course page. On by default; a personal address is never shown whatever this says.';
