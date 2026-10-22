-- A trolley datasheet is IMMOOS's, not the resort's. Four rows came in under
-- a client's room and were tagged with that client by 263, which would have
-- kept them off every other tramway job — and the next one will want the same
-- trolley sheet.
--
-- Cleared, not deleted: the material is ours to use anywhere, which is what
-- an empty client means. Their own evacuation plans, equipment lists and
-- training records stay theirs.
update library_items
set client_id = null, updated_at = now()
where client_id is not null
  and (
    title ilike '%immoos%'
    or title ilike '%glider technical specification%'
    or title ilike '%cable glider instruction%'
  );
