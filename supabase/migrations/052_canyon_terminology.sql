-- Standardize display wording on "canyon" (umbrella for canyoneering/canyoning).
-- Brent's bio is intentionally left in his own words.

update instructors
set title = 'Instructor — Swiftwater & Canyon'
where slug = 'brent-roth';

update instructors
set bio = replace(
  bio,
  'guiding climbing, mountaineering, and canyoneering throughout the region',
  'guiding climbing, mountaineering, and canyon descents throughout the region'
)
where slug = 'nadav-oakes';
