-- Recording an invoice that was raised somewhere other than the biller's page.
--
-- The two milestones on a request — invoiced, paid — were only ever settable
-- through the biller's tokenised link. That assumed Harken always works the
-- queue, and they do not always: a number gets confirmed in a reply to an
-- email, a payment gets mentioned on a call. With no way to record that from
-- our side, the portal would go on showing "with Harken" for a course that was
-- invoiced and paid months ago, and the only fix was to ask the biller to go
-- and click something about work she had already finished.
--
-- So an admin can record either milestone too. Who did it is kept apart from
-- who did it at Harken, in its own column, because the two facts are not
-- interchangeable: "Harken says it is invoiced" and "we were told it is
-- invoiced" carry different weight when the number later turns out wrong.
alter table public.invoice_requests
  add column if not exists invoiced_by_admin uuid references public.profiles(id) on delete set null,
  add column if not exists paid_by_admin     uuid references public.profiles(id) on delete set null;

comment on column public.invoice_requests.invoiced_by_admin is
  'Set when one of us recorded the invoice rather than the biller marking it on her own page. Mutually exclusive with invoiced_by in practice, and kept separate so the source of the claim is never lost.';
