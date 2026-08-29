-- Payment tracking: instructors mark a submitted report once the money lands.
--
-- Deliberately NOT a third `status` value. Whether Harken has paid you is a
-- different fact from whether you filed the report, and approval still happens
-- outside the portal (039) — so this hangs beside `status`, not inside it.
--
-- A date rather than a boolean: the checkbox reads the same either way, but a
-- date can answer "how long has this been outstanding", which a flag cannot.
alter table public.expense_reports
  add column if not exists payment_received_on date;

comment on column public.expense_reports.payment_received_on is
  'Self-reported date the reimbursement arrived. Personal tracking marker set by the report owner — the portal cannot verify payment, so this is not an accounting record.';
