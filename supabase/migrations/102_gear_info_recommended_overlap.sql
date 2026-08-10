-- The other half of the same problem: `info` and `recommended` saying one
-- thing twice.
--
-- 101 pulled product names out of `recommended` because models had replaced
-- them. That left a smaller overlap behind, between the two free-text fields
-- themselves. A row that renders "Mountaineering harness — Mountaineering
-- harness" is the same failure with a different pair of columns.
--
-- Three rows across the whole catalog, so this is a tidy rather than a
-- migration. The rule applied: `info` says what the thing is for, `recommended`
-- says which one to get. Whichever field was repeating the other's words loses
-- them, and neither field loses a fact.

-- The entry restated what the type's recommendation already said, word for
-- word, so the row printed it on both halves of the same line.
update public.gear_list_entries
set info = null
where info = 'Mountaineering harness';

-- "Quick link" is already the row's name — the recommendation only needs to
-- carry the spec.
update public.gear_items
set recommended = 'Stainless steel, 8mm'
where name = 'Quick link'
  and recommended = 'Stainless steel 8mm quick link';

-- The type already recommends "Lightweight"; the sentence explaining why the
-- jacket is on the list does not need to say it a second time.
update public.gear_list_entries
set info = 'Worn with the wetsuit, as a layer to reduce wind chill.'
where info = 'Worn with the wetsuit. A lightweight rain jacket is a good layer to reduce wind chill.';
