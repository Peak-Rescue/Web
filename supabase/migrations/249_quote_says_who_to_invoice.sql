-- The client says who the invoice goes to, at the moment they accept.
--
-- Accepting a quote is the one point where someone on the client's side is
-- already looking at our paperwork and answering questions, and "who do we
-- bill" is the question the handoff to Harken has always had to chase
-- afterwards. So the quote shows the billing contact we have and lets the
-- client confirm or correct it, or asks outright when we have nobody.
--
-- The answer is written onto the course's contacts too (tagged `billing`),
-- which is what the handoff reads. This column is the record of what the
-- client said, kept with the quote they said it on: the contact list is ours
-- to edit afterwards, and "they told us to bill Jane" should still be
-- readable once somebody has.
--
-- { name, email, phone, note } — note is a PO number or billing instructions.
alter table public.course_quotes
  add column if not exists bill_to jsonb;

comment on column public.course_quotes.bill_to is
  'Who the client said to invoice when accepting: { name, email, phone, note }. Null on quotes accepted before the question existed, or paid by card without an answer.';
