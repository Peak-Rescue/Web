-- A quantity somebody set on purpose and does not want pulled back to the
-- course's own numbers — a flight line covering some driving and some flying,
-- say. Holds the course's counts at the moment it was kept, not a bare flag:
-- keeping a number means "this is right for a course of this shape", so the
-- ask comes back when the shape changes and the decision is worth revisiting.
alter table estimate_items add column if not exists drift_ack jsonb;

comment on column estimate_items.drift_ack is
  'Course counts when this quantity was deliberately kept: { i: instructors, s: students, d: days }. Null = never kept. The line is checked against the course again once any of the three differs.';
