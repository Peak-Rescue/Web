-- The line under the price nobody ever wrote.
--
-- 047 gave a quote a unit_rate_note — "$440 per student per day" — to sit under
-- the total and say what the number worked out to. In every quote written
-- since, it has been filled in zero times. A per-unit figure is a scope
-- statement, and the scope bullets are already there and already used.
--
-- Deploy order: the code stopped reading this before the column went, because
-- QUOTE_ROW_COLUMNS names its columns and a build still serving after the drop
-- would fail every quote read, not degrade.
--
-- Nothing is lost with it. Verified empty across every quote before dropping.

alter table public.course_quotes drop column if exists unit_rate_note;
