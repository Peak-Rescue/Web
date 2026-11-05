-- How long the sender spent on the contact form, in milliseconds, as measured
-- by the browser. Anything under a few seconds is a bot; null means the
-- submission didn't come from our form at all.
alter table public.contact_submissions
  add column if not exists fill_ms integer;
