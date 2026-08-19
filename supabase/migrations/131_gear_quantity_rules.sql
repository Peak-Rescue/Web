-- How many, worked out from the number of students instead of typed.
--
-- `quantity` is free text, and the lists show what people did with it: "1 per
-- pair", "1 per rope", "1 per 4 people". Those are ratios written where nothing
-- can compute with them, so the POC still had to do the multiplication by hand
-- for every course, and a course whose roster changed had a gear list that
-- quietly went on being right for the old number.
--
-- The ratio is the fact. Two columns hold it:
--
--   qty_each          how many of the item per unit
--   qty_per_students  how many students that unit covers
--
-- Personal kit is `1 per 1` — one each. Group kit is `1 per 4`, or whatever the
-- ratio is. A row with no qty_per_students has no rule and behaves exactly as it
-- always did, which is what "20 ft" and "sample of ladder types" need.
--
-- The number is NOT stored. It is `ceil(students / qty_per_students) * qty_each`
-- worked out wherever the list is read, from max_students on the course — the
-- same number the quote is priced on, so the gear list and the quote cannot
-- disagree about how many people are coming. Nothing to recompute, nothing to
-- go stale, and a template — which has no course and so no number — shows the
-- rule instead of a made-up total.
--
-- `quantity` stays, and on a row with a rule it means one thing: a number typed
-- over the rule for this course. It is shown as an override with the rule
-- beside it, and clearing the box hands the row back to its rule. Two fields
-- that can disagree is the shape that produced every bug in migration 130 — the
-- difference here is that the disagreement is the whole point, both halves are
-- on screen together, and neither can be stranded where nobody can see it.

alter table public.gear_list_entries
  add column if not exists qty_each         numeric,
  add column if not exists qty_per_students int;

comment on column public.gear_list_entries.qty_each is
  'How many of this item per unit of students. Null reads as 1.';
comment on column public.gear_list_entries.qty_per_students is
  'How many students one unit covers: 1 for personal kit, 4 for one between four. Null means no rule — the row is however many quantity says.';
comment on column public.gear_list_entries.quantity is
  'The quantity as written. On a row with a rule this is a number typed over it for this course; clearing it hands the row back to the rule.';

alter table public.gear_list_entries drop constraint if exists gear_entries_qty_positive;
alter table public.gear_list_entries add constraint gear_entries_qty_positive check (
  (qty_each is null or qty_each > 0) and (qty_per_students is null or qty_per_students > 0)
);

-- Backfill. Personal kit has always meant per person — that is what the side of
-- the list says — so a personal row is one each, and a personal row reading "2"
-- is two each, which is the only thing it could have meant. The number moves
-- into the rule rather than staying beside it, because left in `quantity` it
-- would read as an override of the rule it came from.
update public.gear_list_entries
set qty_each = 1, qty_per_students = 1
where group_type = 'personal' and qty_per_students is null and quantity is null;

update public.gear_list_entries
set qty_each = quantity::numeric, qty_per_students = 1, quantity = null
where group_type = 'personal' and qty_per_students is null
  and quantity ~ '^\s*\d+(\.\d+)?\s*$' and quantity::numeric > 0;

-- Group kit is left alone except where someone has already written the ratio
-- out in full. "1 per 4 people" is exactly this feature, typed into a text box.
update public.gear_list_entries
set qty_each = (regexp_match(quantity, '^\s*(\d+)\s+per\s+(\d+)\s+(people|students)\s*$'))[1]::numeric,
    qty_per_students = (regexp_match(quantity, '^\s*(\d+)\s+per\s+(\d+)\s+(people|students)\s*$'))[2]::int,
    quantity = null
where group_type = 'group' and qty_per_students is null
  and quantity ~ '^\s*\d+\s+per\s+\d+\s+(people|students)\s*$';

-- "1 per pair" and "1 per rope" stay as they are. A pair is probably two
-- students and probably isn't; a rope is not students at all. Guessing at either
-- would put a number on a packing list that nobody said, so they keep reading as
-- the prose they are until someone who knows sets the ratio on the row.
