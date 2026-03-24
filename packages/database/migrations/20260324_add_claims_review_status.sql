BEGIN;

-- ============================================================
-- Add claims_review_status to dam_assets
--
-- Tracks whether the visible claims in an asset have been
-- reviewed and cleared for use. Distinct from compliance_status
-- (regulatory) and brand_legal_approval (legal sign-off).
--
-- Values:
--   pending    — not yet reviewed
--   approved   — claims reviewed and cleared
--   challenged — claims under dispute or flagged for re-review
--   expired    — approval has lapsed and needs renewal
-- ============================================================

ALTER TABLE public.dam_assets
  ADD COLUMN IF NOT EXISTS claims_review_status TEXT
    CHECK (claims_review_status IN ('pending', 'approved', 'challenged', 'expired'));

COMMIT;
