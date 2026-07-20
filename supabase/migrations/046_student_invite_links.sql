-- Student self-signup is by unique course invite link only (public signup is
-- disabled on the login page). One active link per course instance; regenerating
-- rotates the token, revoking clears it. Validation happens server-side with the
-- service role — anon users never query these columns directly.
alter table course_instances
  add column invite_token uuid unique,
  add column invite_expires_at timestamptz;
