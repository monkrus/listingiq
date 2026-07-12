-- Migration: Add pms_webhooks table for incoming PMS webhook events
-- Run this in your Supabase SQL editor.

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
