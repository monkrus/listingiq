-- Migration: Add UNIQUE constraint on cached_reports.session_id
-- Run this in your Supabase SQL editor.
--
-- Why: updateCachedPhotos() and cacheReport() both upsert with
-- onConflict: 'session_id'. Without a unique constraint (or unique index)
-- on session_id, PostgREST cannot resolve the conflict target and will
-- silently degrade the upsert to a plain INSERT, causing NOT NULL violations
-- (plan / listing_url / report_data) when updateCachedPhotos runs after
-- cacheReport. The customer then sees "Pending" / the upload dropzone on
-- email re-access instead of the photos they paid for.
--
-- Also backfills: if session_id is already the primary key or already has
-- a unique index, the ADD CONSTRAINT will no-op via the IF NOT EXISTS guard.

-- Clean up any accidental duplicates first (keep most recent row per session)
DELETE FROM cached_reports a
USING cached_reports b
WHERE a.session_id = b.session_id
  AND a.created_at < b.created_at;

-- Add the unique constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cached_reports_session_id_unique'
  ) THEN
    ALTER TABLE cached_reports
      ADD CONSTRAINT cached_reports_session_id_unique UNIQUE (session_id);
  END IF;
END $$;
