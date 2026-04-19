-- Migration v5: Add configurable max items per visitor per event
-- Run this manually against your Supabase instance

ALTER TABLE events
ADD COLUMN max_items integer NOT NULL DEFAULT 2
  CHECK (max_items >= 1 AND max_items <= 10);
