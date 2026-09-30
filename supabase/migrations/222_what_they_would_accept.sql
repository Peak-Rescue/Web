-- An expression of interest was a yes or a no, and it could not say to what.
--
-- The interest page tells somebody which seat we would put them in, worked out
-- from what is open at the moment they open the link and what they are signed
-- off for. That reads like an offer and is not one: seats fill, plans change,
-- and nothing held us to it — so a person could say yes to "assist" and be
-- staffed as a shadow at two thirds of the wage. 219 made the seat the wage,
-- which turned a staffing detail into a pay question.
--
-- So the question changes direction. Instead of telling them what they would be,
-- we ask which seats they would take, and staffing reads the answer. A
-- willingness does not go stale the way an availability count does: it stays
-- true however the crew fills up, which is exactly why it belongs in the answer
-- rather than in the invite.
--
-- `interested` stays as it is — null unanswered, false can't make it, true yes —
-- because the staffing panel, the readiness chain and the call-out page all read
-- it, and a yes is still a yes. `accepts` is what that yes was to.

alter table public.course_interest_invites
  add column if not exists accepts instructor_instance_role[];

comment on column public.course_interest_invites.accepts is
  'The seats this person said they would work, in their own words: an array of staffing roles. Null on a yes given before we started asking (and on every row that predates this column) — which means "yes, seat unstated", not "any seat". Empty array never means anything: a yes to nothing is a no, and the page will not send one.';

-- Deliberately no backfill. Guessing that an old yes meant "whatever you like"
-- would invent consent nobody gave, and guessing it meant "assist" would invent
-- a different one. Null says we did not ask, which is true.
