-- Which quote a course is billed against had one rule, and no rule always wins.
--
-- The page took the last quote the client received, on the reasoning that a
-- re-quote supersedes what came before it. Usually true. But a quote goes back
-- and forth between options — PR-0059 had Q1 accepted, then Q2 sent for a
-- different shape of the course, and the course that ran was Q1. Nothing in the
-- statuses says so: Q2 was never declined, it just was not the one.
--
-- So the rule becomes the default and the answer is written down. Null means
-- nobody has said, and the page goes on picking the last quote sent. Set, the
-- billing form, the number offered to "what we billed", and the COA the actuals
-- seed from all follow it together.

alter table public.course_instances
  add column if not exists billing_quote_id uuid references public.course_quotes(id) on delete set null;

comment on column public.course_instances.billing_quote_id is
  'The quote this course is billed against, when somebody has chosen one. Null means follow the default — the last quote the client received (pickBillableQuote). A choice that stops being billable (declined, archived, total 0) is ignored at read time rather than cleared, so un-declining it brings the choice back.';
