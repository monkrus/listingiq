-- Migration: Add email_sent_at column for durable email dedup
-- Run this in your Supabase SQL editor before deploying

-- Add email_sent_at to cached_reports for durable dedup across cold starts
ALTER TABLE cached_reports ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- Index for fast lookups when checking if email was already sent
CREATE INDEX IF NOT EXISTS idx_cached_reports_email_sent
  ON cached_reports (session_id)
  WHERE email_sent_at IS NOT NULL;
