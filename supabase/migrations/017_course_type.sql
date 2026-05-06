-- Replace free-text title with structured course type from the services list
alter table course_instances
  drop column title,
  add column course_category text not null default 'tactical',
  add column course_type     text not null default 'custom',
  add column custom_title    text;
