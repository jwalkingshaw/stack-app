BEGIN;

-- ============================================================
-- Promote key DAM asset metadata from JSONB to structured columns
-- and add supplement/sports-nutrition-specific fields.
--
-- These fields were previously buried in metadata JSONB, making
-- them unindexable, unfilter-able, and unusable as set rule
-- conditions. Promoting them enables:
--   - Set rule conditions (compliance_status, certifications, etc.)
--   - Library filters (file_type, asset_status, approval)
--   - Rights expiry enforcement (usage_end, talent_contract_end)
--   - Print-vs-digital routing (color_profile, print_vs_digital)
--   - Athlete content management (athlete_names, talent_contract_end)
--   - Claims tracking (visible_claims, claims_approved_markets)
-- ============================================================

-- ── Compliance & Approval ──────────────────────────────────
ALTER TABLE public.dam_assets
  ADD COLUMN IF NOT EXISTS compliance_status      VARCHAR(32)
    CHECK (compliance_status IN ('Pending','Approved','Rejected','Under Review')),
  ADD COLUMN IF NOT EXISTS brand_legal_approval   VARCHAR(32)
    CHECK (brand_legal_approval IN ('Pending','Approved','Rejected'));

-- ── Rights & Talent ───────────────────────────────────────
ALTER TABLE public.dam_assets
  ADD COLUMN IF NOT EXISTS talent_present         BOOLEAN,
  ADD COLUMN IF NOT EXISTS release_on_file        BOOLEAN,
  ADD COLUMN IF NOT EXISTS usage_end              DATE,
  ADD COLUMN IF NOT EXISTS usage_territory        VARCHAR(32)
    CHECK (usage_territory IN ('Global','US','EU','APAC','Other')),
  ADD COLUMN IF NOT EXISTS license_ownership      VARCHAR(64)
    CHECK (license_ownership IN ('Work for Hire','UGC License','Licensed','Owned','Rights-Managed')),
  ADD COLUMN IF NOT EXISTS usage_platforms        TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS ftc_disclosure_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS athlete_names          TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS talent_contract_end    DATE,
  ADD COLUMN IF NOT EXISTS endorsement_type       VARCHAR(64)
    CHECK (endorsement_type IN ('Sponsored Athlete','Paid Partnership','UGC','Ambassador'));

-- ── Regulatory & Certifications ───────────────────────────
ALTER TABLE public.dam_assets
  ADD COLUMN IF NOT EXISTS regulatory_region      TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS certifications         TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS visible_claims         TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS claims_approved_markets TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS wada_risk_level        VARCHAR(32) NOT NULL DEFAULT 'none'
    CHECK (wada_risk_level IN ('none','low','flagged'));

-- ── Accessibility & Distribution ──────────────────────────
ALTER TABLE public.dam_assets
  ADD COLUMN IF NOT EXISTS alt_text               TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date        DATE,
  ADD COLUMN IF NOT EXISTS usage_platforms_note   TEXT;  -- freetext supplement to usage_platforms[]

-- ── Image Dimensions (persist for channel spec matching) ──
ALTER TABLE public.dam_assets
  ADD COLUMN IF NOT EXISTS width                  INTEGER CHECK (width > 0),
  ADD COLUMN IF NOT EXISTS height                 INTEGER CHECK (height > 0);

-- ── Label / Artwork Classification ────────────────────────
ALTER TABLE public.dam_assets
  ADD COLUMN IF NOT EXISTS artwork_type           VARCHAR(64)
    CHECK (artwork_type IN (
      'Front Panel','Back Panel','Side Panel','Carton',
      'Shipper','Tray','Insert','Hang Tag','Hero Shot',
      'Lifestyle','Ingredient Focus','Before/After',
      '360 Render','3D Render','Social Graphic','Other'
    )),
  ADD COLUMN IF NOT EXISTS color_profile          VARCHAR(32)
    CHECK (color_profile IN ('RGB','sRGB','CMYK','Pantone','Greyscale')),
  ADD COLUMN IF NOT EXISTS print_vs_digital       VARCHAR(16) NOT NULL DEFAULT 'digital'
    CHECK (print_vs_digital IN ('print','digital')),
  ADD COLUMN IF NOT EXISTS resolution_dpi         INTEGER CHECK (resolution_dpi > 0),
  ADD COLUMN IF NOT EXISTS label_version          VARCHAR(64),
  ADD COLUMN IF NOT EXISTS formula_version        VARCHAR(64);

-- ── Lifecycle Status ──────────────────────────────────────
-- draft: not yet ready for distribution
-- active: approved for use
-- archived: retired from active use but retained
-- retired: permanently decommissioned (discontinued product)
ALTER TABLE public.dam_assets
  ADD COLUMN IF NOT EXISTS asset_status           VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (asset_status IN ('draft','active','archived','retired'));

-- ── Backfill from metadata JSONB ──────────────────────────
-- Migrate values already captured in upload workflow metadata.
-- NULL-safe: only sets if not already populated and JSONB field exists.

UPDATE public.dam_assets
SET
  compliance_status = CASE
    WHEN compliance_status IS NULL AND (metadata->>'complianceStatus') IS NOT NULL
    THEN (metadata->>'complianceStatus')::VARCHAR(32)
    ELSE compliance_status
  END,
  brand_legal_approval = CASE
    WHEN brand_legal_approval IS NULL AND (metadata->>'brandLegalApproval') IS NOT NULL
    THEN (metadata->>'brandLegalApproval')::VARCHAR(32)
    ELSE brand_legal_approval
  END,
  talent_present = CASE
    WHEN talent_present IS NULL AND (metadata->>'talentPresent') IS NOT NULL
    THEN (metadata->>'talentPresent')::BOOLEAN
    ELSE talent_present
  END,
  release_on_file = CASE
    WHEN release_on_file IS NULL AND (metadata->>'releaseOnFile') IS NOT NULL
    THEN (metadata->>'releaseOnFile')::BOOLEAN
    ELSE release_on_file
  END,
  usage_end = CASE
    WHEN usage_end IS NULL AND (metadata->>'usageEnd') IS NOT NULL
    THEN (metadata->>'usageEnd')::DATE
    ELSE usage_end
  END,
  usage_territory = CASE
    WHEN usage_territory IS NULL AND (metadata->>'usageTerritory') IS NOT NULL
    THEN (metadata->>'usageTerritory')::VARCHAR(32)
    ELSE usage_territory
  END,
  license_ownership = CASE
    WHEN license_ownership IS NULL AND (metadata->>'licenseOwnership') IS NOT NULL
    THEN (metadata->>'licenseOwnership')::VARCHAR(64)
    ELSE license_ownership
  END,
  ftc_disclosure_required = CASE
    WHEN ftc_disclosure_required IS NULL AND (metadata->>'ftcDisclosureRequired') IS NOT NULL
    THEN (metadata->>'ftcDisclosureRequired')::BOOLEAN
    ELSE ftc_disclosure_required
  END,
  alt_text = CASE
    WHEN alt_text IS NULL AND (metadata->>'altText') IS NOT NULL
    THEN metadata->>'altText'
    ELSE alt_text
  END,
  endorsement_type = CASE
    WHEN endorsement_type IS NULL AND (metadata->>'endorsementType') IS NOT NULL
    THEN (metadata->>'endorsementType')::VARCHAR(64)
    ELSE endorsement_type
  END,
  wada_risk_level = CASE
    WHEN (metadata->>'wadaRiskLevel') IS NOT NULL
    THEN (metadata->>'wadaRiskLevel')::VARCHAR(32)
    ELSE wada_risk_level
  END,
  label_version = CASE
    WHEN label_version IS NULL AND (metadata->>'labelVersion') IS NOT NULL
    THEN metadata->>'labelVersion'
    ELSE label_version
  END,
  formula_version = CASE
    WHEN formula_version IS NULL AND (metadata->>'formulaVersion') IS NOT NULL
    THEN metadata->>'formulaVersion'
    ELSE formula_version
  END
WHERE metadata IS NOT NULL AND metadata != '{}'::JSONB;

-- Array fields: extract from JSONB arrays
UPDATE public.dam_assets
SET
  regulatory_region = CASE
    WHEN array_length(regulatory_region, 1) IS NULL AND jsonb_array_length(metadata->'regulatoryRegion') > 0
    THEN ARRAY(SELECT jsonb_array_elements_text(metadata->'regulatoryRegion'))
    ELSE regulatory_region
  END,
  certifications = CASE
    WHEN array_length(certifications, 1) IS NULL AND jsonb_array_length(metadata->'certifications') > 0
    THEN ARRAY(SELECT jsonb_array_elements_text(metadata->'certifications'))
    ELSE certifications
  END,
  usage_platforms = CASE
    WHEN array_length(usage_platforms, 1) IS NULL AND jsonb_array_length(metadata->'usagePlatforms') > 0
    THEN ARRAY(SELECT jsonb_array_elements_text(metadata->'usagePlatforms'))
    ELSE usage_platforms
  END,
  athlete_names = CASE
    WHEN array_length(athlete_names, 1) IS NULL AND jsonb_array_length(metadata->'talentNames') > 0
    THEN ARRAY(SELECT jsonb_array_elements_text(metadata->'talentNames'))
    ELSE athlete_names
  END
WHERE metadata IS NOT NULL AND metadata != '{}'::JSONB
  AND jsonb_typeof(metadata) = 'object';

-- ── Indexes ───────────────────────────────────────────────
-- Compliance/approval — used heavily in set rules and library filters
CREATE INDEX IF NOT EXISTS idx_dam_assets_compliance_status
  ON public.dam_assets (organization_id, compliance_status)
  WHERE compliance_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dam_assets_brand_legal_approval
  ON public.dam_assets (organization_id, brand_legal_approval)
  WHERE brand_legal_approval IS NOT NULL;

-- Asset status — used in every set rule to exclude non-active assets
CREATE INDEX IF NOT EXISTS idx_dam_assets_asset_status
  ON public.dam_assets (organization_id, asset_status);

-- Rights expiry — used for expiry alert queries
CREATE INDEX IF NOT EXISTS idx_dam_assets_usage_end
  ON public.dam_assets (organization_id, usage_end)
  WHERE usage_end IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dam_assets_talent_contract_end
  ON public.dam_assets (organization_id, talent_contract_end)
  WHERE talent_contract_end IS NOT NULL;

-- Talent — used for "find all assets featuring this athlete" queries
CREATE INDEX IF NOT EXISTS idx_dam_assets_athlete_names
  ON public.dam_assets USING GIN (athlete_names);

-- Certifications — used in set rules ("NSF certified → Amazon A+ set")
CREATE INDEX IF NOT EXISTS idx_dam_assets_certifications
  ON public.dam_assets USING GIN (certifications);

-- Regulatory region — used in set rules ("US approved → US retailer set")
CREATE INDEX IF NOT EXISTS idx_dam_assets_regulatory_region
  ON public.dam_assets USING GIN (regulatory_region);

-- Visible claims — used for claim impact analysis
CREATE INDEX IF NOT EXISTS idx_dam_assets_visible_claims
  ON public.dam_assets USING GIN (visible_claims);

-- Artwork type — used in set rules and library filters
CREATE INDEX IF NOT EXISTS idx_dam_assets_artwork_type
  ON public.dam_assets (organization_id, artwork_type)
  WHERE artwork_type IS NOT NULL;

-- Print vs digital — used in set rules
CREATE INDEX IF NOT EXISTS idx_dam_assets_print_vs_digital
  ON public.dam_assets (organization_id, print_vs_digital);

-- WADA risk — fast gating for sports nutrition brands
CREATE INDEX IF NOT EXISTS idx_dam_assets_wada_risk_level
  ON public.dam_assets (organization_id, wada_risk_level)
  WHERE wada_risk_level != 'none';

-- Expiration date
CREATE INDEX IF NOT EXISTS idx_dam_assets_expiration_date
  ON public.dam_assets (organization_id, expiration_date)
  WHERE expiration_date IS NOT NULL;

COMMIT;
