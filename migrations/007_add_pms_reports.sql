-- Migration: Add pms_reports table for persistent PMS integration reports
-- Run this in your Supabase SQL editor.
--
-- Stores analysis reports from Hospitable/Hostex integrations so users
-- can revisit their results without re-running analysis.

CREATE TABLE IF NOT EXISTS pms_reports (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform       text NOT NULL CHECK (platform IN ('hospitable', 'hostex')),
  connection_id  text NOT NULL,
  property_id    text NOT NULL,
  session_id     text,              -- Stripe session ID (null for free/beta)
  plan           text NOT NULL,     -- 'quick-score' | 'full-audit'
  listing_data   jsonb NOT NULL,    -- snapshot of ListingInput at analysis time
  report_data    jsonb NOT NULL,    -- full analysis report
  overall_score  integer DEFAULT 0,
  photo_results  jsonb,             -- photo analysis results (if full-audit)
  created_at     timestamptz DEFAULT now()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_pms_reports_connection
  ON pms_reports (connection_id, platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pms_reports_property
  ON pms_reports (connection_id, property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pms_reports_session
  ON pms_reports (session_id) WHERE session_id IS NOT NULL;

-- RLS
ALTER TABLE pms_reports ENABLE ROW LEVEL SECURITY;
