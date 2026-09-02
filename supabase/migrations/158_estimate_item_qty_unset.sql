-- A quantity nobody has set yet is not one. Mileage, admin days and anything
-- else the course cannot derive used to arrive as a 1, which reads as a real
-- number and prices a five-hundred-mile drive at one mile. Blank is now
-- storable, so a line that still needs a number can say so on every reload
-- rather than only in the session it was added.
alter table estimate_items alter column qty drop not null;

comment on column estimate_items.qty is
  'Null = not set yet, and the line says so. Zero is a real zero — none of this cost.';
