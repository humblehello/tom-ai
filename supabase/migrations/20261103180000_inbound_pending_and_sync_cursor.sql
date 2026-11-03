-- Staging table for inbound senders who are not an obvious machine
-- and are not a confirmed two-way relationship.
-- Cursor columns let a Google sync resume after a timeout.
--
-- Run this in the Supabase SQL editor before relying on inbound review
-- or on a sync that survives a restart. Do not run it from a deploy.
-- Nothing here updates or deletes a contact.

CREATE TABLE IF NOT EXISTS inbound_pending_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  subject text,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'inbox_scan',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Emails are stored lowercase by the app. The upsert conflict target is (user_id, email).
CREATE UNIQUE INDEX IF NOT EXISTS inbound_pending_contacts_user_email_idx
  ON inbound_pending_contacts (user_id, email);

ALTER TABLE tom_users
  ADD COLUMN IF NOT EXISTS google_sync_page_token text,
  ADD COLUMN IF NOT EXISTS google_sync_mode text;

COMMENT ON COLUMN tom_users.google_sync_page_token IS
  'People API pageToken for an in-progress Google contact sync. Cleared when the pass finishes.';

COMMENT ON COLUMN tom_users.google_sync_mode IS
  'full or delta while a Google contact sync is mid-pass. Null when idle.';
