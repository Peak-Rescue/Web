-- The quote number, in the form the client was given it.
--
-- The request already points at the quote by id, which is the right link and
-- the wrong fact: a uuid is not something a biller can put on an invoice or a
-- client can reconcile against. What both of them know is "PR-0042-Q2" —
-- the number on the document that was actually sent.
--
-- It also settles which request is which. A renegotiated course produces a
-- second request, and both carry the same course ref; the quote number is the
-- only thing on the row that tells them apart.
--
-- Snapshotted like everything else here, and for the same reason: a quote
-- archived or deleted later must not take the number off an invoice that has
-- already gone out. Which is why this is not a join on quote_id, which is
-- nullable precisely so the request can outlive the quote.
alter table public.invoice_requests
  add column if not exists quote_number text;

comment on column public.invoice_requests.quote_number is
  'The quote as the client knows it ("PR-0042-Q2"), copied in at send. Distinguishes the second request on a renegotiated course from the first.';
