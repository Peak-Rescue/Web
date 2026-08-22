-- `internal` was named for the case that prompted it — a CE day we laid on for
-- our own instructors — but the thing it actually marks is narrower: a course
-- with no student roster. Nobody enrols, everyone on it is crew, and only they
-- can see it.
--
-- That leaves room for a client. A consultation we're hired to run has no
-- students and no roster, but it has a customer and a quote like any other
-- job. So the flag drives the roster and who can see the course; whether
-- there's a client_name drives the money and which calendar it syncs to.
--
-- Recorded here rather than renaming the column: the name is imperfect, the
-- meaning is not, and a rename would break every course page for the gap
-- between this and the deploy that followed it.
comment on column public.course_instances.internal is
  'No student roster: everyone on the course is crew and only they can see it. '
  'Instructor development, CE, a consultation, anything that is not a class. '
  'Says nothing about whether there is a client — one is entirely possible, '
  'and client_name is what decides pricing and calendar routing.';
