BEGIN;

-- ============================================================
-- Extend share_set_dynamic_rules with new asset condition columns.
--
-- These conditions were previously impossible to express because
-- the relevant fields lived in metadata JSONB. Now that they are
-- real columns on dam_assets (20260324_add_dam_asset_structured_fields),
-- they can be used as first-class rule criteria.
--
-- New asset conditions added:
--   include_compliance_statuses / exclude_compliance_statuses
--   include_brand_legal_approvals / exclude_brand_legal_approvals
--   include_asset_statuses / exclude_asset_statuses
--   include_file_types / exclude_file_types
--   include_artwork_types / exclude_artwork_types
--   include_print_vs_digital (single enum value)
--   include_certifications / exclude_certifications
--   include_regulatory_regions / exclude_regulatory_regions
--   include_wada_risk_levels / exclude_wada_risk_levels
--   require_talent_release (boolean gate)
--   usage_end_within_days (integer — match assets expiring within N days)
-- ============================================================

ALTER TABLE public.share_set_dynamic_rules

  -- Compliance & approval gates
  ADD COLUMN IF NOT EXISTS include_compliance_statuses   TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS exclude_compliance_statuses   TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS include_brand_legal_approvals TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS exclude_brand_legal_approvals TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Lifecycle status
  ADD COLUMN IF NOT EXISTS include_asset_statuses        TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS exclude_asset_statuses        TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- File type (image/video/document/other)
  ADD COLUMN IF NOT EXISTS include_file_types            TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS exclude_file_types            TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Artwork type (Front Panel, Back Panel, Carton, etc.)
  ADD COLUMN IF NOT EXISTS include_artwork_types         TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS exclude_artwork_types         TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Print vs digital
  ADD COLUMN IF NOT EXISTS include_print_vs_digital      TEXT
    CHECK (include_print_vs_digital IN ('print', 'digital')),

  -- Certifications (NSF, Informed Sport, etc.)
  ADD COLUMN IF NOT EXISTS include_certifications        TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS exclude_certifications        TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Regulatory region (US, EU, UK, Canada, etc.)
  ADD COLUMN IF NOT EXISTS include_regulatory_regions    TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS exclude_regulatory_regions    TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- WADA risk level
  ADD COLUMN IF NOT EXISTS include_wada_risk_levels      TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS exclude_wada_risk_levels      TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Talent release gate: if true, asset must have talent_present=false OR release_on_file=true
  ADD COLUMN IF NOT EXISTS require_talent_release        BOOLEAN NOT NULL DEFAULT false,

  -- Expiry window: match assets whose usage_end or expiration_date is within N days
  -- NULL = no expiry filter
  ADD COLUMN IF NOT EXISTS usage_end_within_days         INTEGER
    CHECK (usage_end_within_days > 0);

-- ── Update the include condition constraint ─────────────────────────────
-- The original CHECK required at least one include condition.
-- Now it must also accept any of the new include conditions.

ALTER TABLE public.share_set_dynamic_rules
  DROP CONSTRAINT IF EXISTS share_set_dynamic_rules_has_include_condition;

ALTER TABLE public.share_set_dynamic_rules
  ADD CONSTRAINT share_set_dynamic_rules_has_include_condition CHECK (
    -- Original asset conditions
    cardinality(include_tags) > 0
    OR cardinality(include_folder_ids) > 0
    OR cardinality(include_usage_group_ids) > 0
    -- New asset conditions
    OR cardinality(include_compliance_statuses) > 0
    OR cardinality(include_brand_legal_approvals) > 0
    OR cardinality(include_asset_statuses) > 0
    OR cardinality(include_file_types) > 0
    OR cardinality(include_artwork_types) > 0
    OR include_print_vs_digital IS NOT NULL
    OR cardinality(include_certifications) > 0
    OR cardinality(include_regulatory_regions) > 0
    OR cardinality(include_wada_risk_levels) > 0
    OR require_talent_release = true
    OR usage_end_within_days IS NOT NULL
    -- Product conditions (from prior migrations)
    OR cardinality(include_product_types) > 0
    OR cardinality(include_product_family_ids) > 0
    OR cardinality(include_product_name_contains) > 0
  );

-- ── GIN indexes for new array condition columns ─────────────────────────

CREATE INDEX IF NOT EXISTS idx_ssdr_include_compliance_statuses
  ON public.share_set_dynamic_rules USING GIN (include_compliance_statuses);

CREATE INDEX IF NOT EXISTS idx_ssdr_include_brand_legal_approvals
  ON public.share_set_dynamic_rules USING GIN (include_brand_legal_approvals);

CREATE INDEX IF NOT EXISTS idx_ssdr_include_asset_statuses
  ON public.share_set_dynamic_rules USING GIN (include_asset_statuses);

CREATE INDEX IF NOT EXISTS idx_ssdr_include_file_types
  ON public.share_set_dynamic_rules USING GIN (include_file_types);

CREATE INDEX IF NOT EXISTS idx_ssdr_include_artwork_types
  ON public.share_set_dynamic_rules USING GIN (include_artwork_types);

CREATE INDEX IF NOT EXISTS idx_ssdr_include_certifications
  ON public.share_set_dynamic_rules USING GIN (include_certifications);

CREATE INDEX IF NOT EXISTS idx_ssdr_include_regulatory_regions
  ON public.share_set_dynamic_rules USING GIN (include_regulatory_regions);

-- ── Update dam_assets trigger to evaluate new conditions ────────────────
-- Replaces (or creates) the trigger function that runs after INSERT/UPDATE
-- on dam_assets to auto-apply dynamic set rules.

CREATE OR REPLACE FUNCTION apply_asset_dynamic_set_rules()
RETURNS TRIGGER AS $$
DECLARE
  rule_row RECORD;
  matches_include BOOLEAN;
  matches_exclude BOOLEAN;
  now_ts TIMESTAMPTZ := NOW();
BEGIN
  -- Only process rows with a known organization
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR rule_row IN
    SELECT *
    FROM share_set_dynamic_rules
    WHERE organization_id = NEW.organization_id
      AND is_active = true
      -- Only asset-module sets (not product sets)
      AND share_set_id IN (
        SELECT id FROM share_sets
        WHERE organization_id = NEW.organization_id
          AND module_key = 'assets'
      )
    ORDER BY priority ASC, updated_at DESC
  LOOP
    -- ── Include evaluation ───────────────────────────────────────────────
    matches_include := false;

    -- Tags overlap
    IF cardinality(rule_row.include_tags) > 0 THEN
      IF (NEW.tags && rule_row.include_tags) THEN
        matches_include := true;
      END IF;
    END IF;

    -- Folder match
    IF NOT matches_include AND cardinality(rule_row.include_folder_ids) > 0 THEN
      IF NEW.folder_id = ANY(rule_row.include_folder_ids) THEN
        matches_include := true;
      END IF;
    END IF;

    -- Compliance status
    IF NOT matches_include AND cardinality(rule_row.include_compliance_statuses) > 0 THEN
      IF NEW.compliance_status = ANY(rule_row.include_compliance_statuses) THEN
        matches_include := true;
      END IF;
    END IF;

    -- Brand legal approval
    IF NOT matches_include AND cardinality(rule_row.include_brand_legal_approvals) > 0 THEN
      IF NEW.brand_legal_approval = ANY(rule_row.include_brand_legal_approvals) THEN
        matches_include := true;
      END IF;
    END IF;

    -- Asset status
    IF NOT matches_include AND cardinality(rule_row.include_asset_statuses) > 0 THEN
      IF NEW.asset_status = ANY(rule_row.include_asset_statuses) THEN
        matches_include := true;
      END IF;
    END IF;

    -- File type
    IF NOT matches_include AND cardinality(rule_row.include_file_types) > 0 THEN
      IF NEW.file_type = ANY(rule_row.include_file_types) THEN
        matches_include := true;
      END IF;
    END IF;

    -- Artwork type
    IF NOT matches_include AND cardinality(rule_row.include_artwork_types) > 0 THEN
      IF NEW.artwork_type = ANY(rule_row.include_artwork_types) THEN
        matches_include := true;
      END IF;
    END IF;

    -- Print vs digital
    IF NOT matches_include AND rule_row.include_print_vs_digital IS NOT NULL THEN
      IF NEW.print_vs_digital = rule_row.include_print_vs_digital THEN
        matches_include := true;
      END IF;
    END IF;

    -- Certifications overlap
    IF NOT matches_include AND cardinality(rule_row.include_certifications) > 0 THEN
      IF (NEW.certifications && rule_row.include_certifications) THEN
        matches_include := true;
      END IF;
    END IF;

    -- Regulatory region overlap
    IF NOT matches_include AND cardinality(rule_row.include_regulatory_regions) > 0 THEN
      IF (NEW.regulatory_region && rule_row.include_regulatory_regions) THEN
        matches_include := true;
      END IF;
    END IF;

    -- WADA risk level
    IF NOT matches_include AND cardinality(rule_row.include_wada_risk_levels) > 0 THEN
      IF NEW.wada_risk_level = ANY(rule_row.include_wada_risk_levels) THEN
        matches_include := true;
      END IF;
    END IF;

    -- Talent release gate: asset must NOT have blocked talent
    IF NOT matches_include AND rule_row.require_talent_release THEN
      IF (NEW.talent_present IS NOT TRUE OR NEW.release_on_file IS TRUE) THEN
        matches_include := true;
      END IF;
    END IF;

    -- Expiry window: assets expiring within N days
    IF NOT matches_include AND rule_row.usage_end_within_days IS NOT NULL THEN
      IF (
        NEW.usage_end IS NOT NULL AND
        NEW.usage_end <= (now_ts + (rule_row.usage_end_within_days || ' days')::INTERVAL)::DATE
      ) OR (
        NEW.expiration_date IS NOT NULL AND
        NEW.expiration_date <= (now_ts + (rule_row.usage_end_within_days || ' days')::INTERVAL)::DATE
      ) THEN
        matches_include := true;
      END IF;
    END IF;

    IF NOT matches_include THEN
      CONTINUE;
    END IF;

    -- ── Exclude evaluation ───────────────────────────────────────────────
    matches_exclude := false;

    IF cardinality(rule_row.exclude_tags) > 0 THEN
      IF (NEW.tags && rule_row.exclude_tags) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF NOT matches_exclude AND cardinality(rule_row.exclude_folder_ids) > 0 THEN
      IF NEW.folder_id = ANY(rule_row.exclude_folder_ids) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF NOT matches_exclude AND cardinality(rule_row.exclude_compliance_statuses) > 0 THEN
      IF NEW.compliance_status = ANY(rule_row.exclude_compliance_statuses) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF NOT matches_exclude AND cardinality(rule_row.exclude_brand_legal_approvals) > 0 THEN
      IF NEW.brand_legal_approval = ANY(rule_row.exclude_brand_legal_approvals) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF NOT matches_exclude AND cardinality(rule_row.exclude_asset_statuses) > 0 THEN
      IF NEW.asset_status = ANY(rule_row.exclude_asset_statuses) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF NOT matches_exclude AND cardinality(rule_row.exclude_file_types) > 0 THEN
      IF NEW.file_type = ANY(rule_row.exclude_file_types) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF NOT matches_exclude AND cardinality(rule_row.exclude_artwork_types) > 0 THEN
      IF NEW.artwork_type = ANY(rule_row.exclude_artwork_types) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF NOT matches_exclude AND cardinality(rule_row.exclude_certifications) > 0 THEN
      IF (NEW.certifications && rule_row.exclude_certifications) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF NOT matches_exclude AND cardinality(rule_row.exclude_regulatory_regions) > 0 THEN
      IF (NEW.regulatory_region && rule_row.exclude_regulatory_regions) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF NOT matches_exclude AND cardinality(rule_row.exclude_wada_risk_levels) > 0 THEN
      IF NEW.wada_risk_level = ANY(rule_row.exclude_wada_risk_levels) THEN
        matches_exclude := true;
      END IF;
    END IF;

    IF matches_exclude THEN
      CONTINUE;
    END IF;

    -- ── Insert into share_set_items if not already present ───────────────
    INSERT INTO share_set_items (
      share_set_id,
      organization_id,
      resource_id,
      resource_type,
      metadata
    )
    VALUES (
      rule_row.share_set_id,
      NEW.organization_id,
      NEW.id,
      'asset',
      jsonb_build_object(
        'source', 'dynamic_rule',
        'rule_id', rule_row.id,
        'applied_at', now_ts
      )
    )
    ON CONFLICT DO NOTHING;

  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to dam_assets
DROP TRIGGER IF EXISTS apply_asset_dynamic_set_rules_trigger ON public.dam_assets;
CREATE TRIGGER apply_asset_dynamic_set_rules_trigger
  AFTER INSERT OR UPDATE OF
    tags, folder_id, compliance_status, brand_legal_approval, asset_status,
    file_type, artwork_type, print_vs_digital, certifications, regulatory_region,
    wada_risk_level, talent_present, release_on_file, usage_end, expiration_date
  ON public.dam_assets
  FOR EACH ROW
  EXECUTE FUNCTION apply_asset_dynamic_set_rules();

COMMIT;
