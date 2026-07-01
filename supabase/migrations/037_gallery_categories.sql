-- Multi-category tagging for gallery images. Values are the service category
-- keys from lib/data/services.ts: 'tactical' | 'sar' | 'industrial' | 'specialty'.
-- Stored as a text[] so a photo can belong to several training areas.

alter table public.gallery_images
  add column if not exists categories text[] not null default '{}';
