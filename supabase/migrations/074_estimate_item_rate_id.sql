-- Estimate lines link to their library rate by id, not label text.
-- The estimator derives factor names ("instructors × days") from the rate's
-- unit, but looked the rate up by exact label match — so renaming a rate in
-- the now-editable library orphaned every existing line (and the calculator
-- fell back to blank "name" inputs). The id survives renames; the label
-- stays as the line's display text.

alter table public.estimate_items
  add column if not exists rate_id uuid references public.pricing_rates(id) on delete set null;

-- Backfill by normalized label match: lowercase, letters only, ignoring a
-- trailing plural "s" — so "Instructor field day", "Instructor field days",
-- and the renamed "Instructor field day/s" all link up. Where two rates
-- normalize alike (e.g. the retired and current "Meals"), prefer the active
-- one. Custom lines ("Swift water cert") match nothing and stay null.
with norm_rates as (
  select distinct on (norm) id, norm
  from (
    select id, active, sort_order,
           regexp_replace(regexp_replace(lower(label), '[^a-z]', '', 'g'), 's$', '') as norm
    from public.pricing_rates
  ) r
  order by norm, active desc, sort_order
)
update public.estimate_items i
set rate_id = nr.id
from norm_rates nr
where i.rate_id is null
  and regexp_replace(regexp_replace(lower(i.label), '[^a-z]', '', 'g'), 's$', '') = nr.norm;
