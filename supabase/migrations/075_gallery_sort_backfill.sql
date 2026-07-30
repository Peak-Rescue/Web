-- Light up the dormant gallery_images.sort_order column: backfill it to match
-- the current display order (newest first) so enabling sort_order-based
-- ordering changes nothing visually until an admin deliberately reorders.
-- New uploads keep the default 0 and therefore surface at the top (created_at
-- desc is the tiebreaker) until placed.

with ranked as (
  select id, row_number() over (order by created_at desc) as rn
  from public.gallery_images
)
update public.gallery_images g
set sort_order = ranked.rn
from ranked
where g.id = ranked.id;
