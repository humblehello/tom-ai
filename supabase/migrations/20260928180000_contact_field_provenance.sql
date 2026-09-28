-- Additive protection for contact edits.
-- Does not update or delete existing rows.
-- Apply in the Supabase SQL editor before relying on the app change.
-- Do not run this from a preview deploy or a local script against production.

ALTER TABLE tom_contacts
  ADD COLUMN IF NOT EXISTS field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tom_contacts.field_provenance IS
  'Per-field source of the current value: human, google, microsoft, scrape, or enrichment. Human fields are written back to Google and are not overwritten by sync or scrape.';

-- Helpful lookup. Safe to create even when duplicate emails already exist.
CREATE INDEX IF NOT EXISTS tom_contacts_user_email_lower_idx
  ON tom_contacts (user_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

-- One primary email per user. Skipped (no error) when duplicates already exist,
-- so this migration cannot fail a database that still has the mixups.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tom_contacts
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY user_id, lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped tom_contacts_user_email_unique: duplicate primary emails already exist. The app will refuse new duplicates. Clean the existing ones, then re-run the unique-index statement at the bottom of this file.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS tom_contacts_user_email_unique
      ON tom_contacts (user_id, lower(email))
      WHERE email IS NOT NULL AND btrim(email) <> '';
  END IF;
END $$;

-- After duplicate primary emails are cleaned up, run this by itself:
-- CREATE UNIQUE INDEX IF NOT EXISTS tom_contacts_user_email_unique
--   ON tom_contacts (user_id, lower(email))
--   WHERE email IS NOT NULL AND btrim(email) <> '';
