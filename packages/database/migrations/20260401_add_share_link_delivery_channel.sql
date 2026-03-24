-- Migration: Add 'share_link' as a valid delivery channel for partner_update_recipients
-- Partners invited via a share link need this channel recorded for analytics/attribution.

BEGIN;

ALTER TABLE partner_update_recipients
  DROP CONSTRAINT partner_update_recipients_channels_ck;

ALTER TABLE partner_update_recipients
  ADD CONSTRAINT partner_update_recipients_channels_ck
    CHECK (
      cardinality(delivery_channels) > 0
      AND delivery_channels <@ ARRAY['in_app', 'email', 'sms', 'share_link']::text[]
    );

COMMIT;
