-- A request remembers who at Harken was told about it.
--
-- With one biller the question never came up. With two it does, and it is the
-- first thing anybody asks of a request that has gone quiet: not "was it
-- sent" but "who has it". The screen was left saying "to Bobbi Price", which
-- is the client being billed — so the one line about sending named the one
-- person who was never sent anything.
--
-- Names rather than ids, and a snapshot rather than a join, for the same
-- reason the payee is a snapshot: this is a record of what happened. A biller
-- who leaves Harken next year does not un-send the email she was sent, and
-- deleting her row must not turn this line into a blank.
alter table public.invoice_requests
  add column if not exists sent_to text[];

comment on column public.invoice_requests.sent_to is
  'The billers this request was emailed to, by name, as they were named at the time. Null on requests sent before anybody could choose, which went to every active biller.';
