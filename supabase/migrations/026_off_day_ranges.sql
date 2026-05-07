-- Allow off days to be date ranges (end_date = null means single day)
alter table instance_off_days add column if not exists end_date date;

-- Drop the old single-date unique constraint and replace with one that covers ranges
alter table instance_off_days drop constraint if exists instance_off_days_instance_id_off_date_key;
