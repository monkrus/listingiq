-- Migration: Add hospitable_connections table for OAuth token storage
-- Run this in your Supabase SQL editor.
--
-- Stores Hospitable OAuth tokens keyed by a random connection_id (UUID).
-- The connection_id is stored in the user's browser (localStorage) since
-- ListingIQ has no user accounts. Tokens are encrypted at rest by Supabase.

CREATE TABLE IF NOT EXISTS hospitable_connections (
  connection_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token  text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Index for cleanup of expired/stale connections
CREATE INDEX IF NOT EXISTS idx_hospitable_connections_updated
  ON hospitable_connections (updated_at);
