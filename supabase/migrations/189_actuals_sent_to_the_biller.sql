-- The actuals get emailed to the biller rather than copied out by hand.
--
-- Making the share link and getting it to Harken were two separate jobs: the
-- portal minted an address and you went to your own mail client to send it.
-- So the button sends it now, and this column is what lets the panel say it
-- already did — without it, "have I sent these?" has no answer on the page
-- and the honest move is to send again.
--
-- It records the last send, not a history: the link does not change between
-- sends, so the only question it has to answer is whether the biller has the
-- address and when they got it.
alter table public.course_actuals
  add column if not exists share_sent_at timestamptz;

comment on column public.course_actuals.share_sent_at is
  'When the share link was last emailed to the active billing recipients. Null means it has only ever been copied by hand.';
