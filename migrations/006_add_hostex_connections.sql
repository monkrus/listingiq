-- Migration: Add hostex_connections table for API token storage
-- Run this in your Supabase SQL editor.
--
-- Stores Hostex API tokens keyed by a random connection_id (UUID).
-- Hostex uses static API tokens (not OAuth), so no refresh_token or expiry needed.

CREATE TABLE IF NOT EXISTS hostex_connections (
  connection_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token  text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE hostex_connections ENABLE ROW LEVEL SECURITY;
