-- Video had no shelf of its own, so a video kept whatever shelf the add form
-- opened on. The ones that ended up on Reference belong with the rest of the
-- teaching material. Instructor-shelf videos are left alone: that shelf was
-- somebody's choice, not a default.
update library_items set bucket = 'teaching', updated_at = now()
where kind = 'video' and bucket = 'resource';
