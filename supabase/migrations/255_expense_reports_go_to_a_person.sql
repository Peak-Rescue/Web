-- Expense reports all went to one address, EXPENSE_REPORT_TO (Micah). That
-- is right for everyone but Micah: he is the approver, so his own reports
-- were landing with himself. His go to Nate at Elevated Safety instead.
--
-- On the person rather than a rule in code, so the next exception is an
-- admin's edit, not a deploy. Null means the default: EXPENSE_REPORT_TO.
alter table public.profiles
  add column if not exists expense_report_to text;

-- Micah, found by what he signs in with — profiles.email is a contact
-- address and never resolves an account.
update profiles p
set expense_report_to = 'nate.paulsberg@elevatedsafety.com'
from auth.users u
where u.id = p.id
  and lower(u.email) = 'micah@peak-rescue.com'
  and p.expense_report_to is null;
