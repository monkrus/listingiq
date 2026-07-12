-- Combined pending migrations for Hospitable/Hostex integration features.
-- Run this in your Supabase SQL editor to apply all pending schema changes.
-- Includes: 007 (pms_reports), 008 (pms_webhooks), 009 (pms_user_emails)

-- =====================================================
-- 007: PMS Reports table
-- =====================================================
CREATE TABLE IF NOT EXISTS pms_reports (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform       text NOT NULL CHECK (platform IN ('hospitable', 'hostex')),
  connection_id  text NOT NULL,
  property_id    text NOT NULL,
  session_id     text,
  plan           text NOT NULL,
  listing_data   jsonb NOT NULL,
  report_data    jsonb NOT NULL,
  overall_score  integer DEFAULT 0,
  photo_results  jsonb,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_reports_connection
  ON pms_reports (connection_id, platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pms_reports_property
  ON pms_reports (connection_id, property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pms_reports_session
  ON pms_reports (session_id) WHERE session_id IS NOT NULL;

ALTER TABLE pms_reports ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 008: PMS Webhooks table
-- =====================================================
CREATE TABLE IF NOT EXISTS pms_webhooks (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform     text NOT NULL CHECK (platform IN ('hospitable', 'hostex')),
  event        text NOT NULL,
  property_id  text,
  payload      jsonb,
  processed    boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_webhooks_unprocessed
  ON pms_webhooks (platform, processed, created_at DESC)
  WHERE processed = false;

ALTER TABLE pms_webhooks ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 009: PMS User Emails (lightweight auth)
-- =====================================================
CREATE TABLE IF NOT EXISTS pms_user_emails (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email          text NOT NULL,
  platform       text NOT NULL CHECK (platform IN ('hospitable', 'hostex')),
  connection_id  text NOT NULL,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(email, platform, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_pms_user_emails_email
  ON pms_user_emails (email, platform);

CREATE INDEX IF NOT EXISTS idx_pms_user_emails_connection
  ON pms_user_emails (connection_id);

ALTER TABLE pms_user_emails ENABLE ROW LEVEL SECURITY;
