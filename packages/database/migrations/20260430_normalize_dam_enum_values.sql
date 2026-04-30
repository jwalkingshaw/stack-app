BEGIN;

CREATE OR REPLACE FUNCTION normalize_dam_enum_token(input_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(lower(trim(COALESCE(input_value, ''))), '[^a-z0-9]+', '_', 'g'),
    ''
  );
$$;

UPDATE dam_assets
SET compliance_status = CASE normalize_dam_enum_token(compliance_status)
  WHEN 'pending' THEN 'pending'
  WHEN 'approved' THEN 'approved'
  WHEN 'rejected' THEN 'rejected'
  WHEN 'under_review' THEN 'under_review'
  WHEN 'compliant' THEN 'approved'
  WHEN 'non_compliant' THEN 'rejected'
  ELSE compliance_status
END
WHERE compliance_status IS NOT NULL;

UPDATE dam_assets
SET brand_legal_approval = CASE normalize_dam_enum_token(brand_legal_approval)
  WHEN 'pending' THEN 'pending'
  WHEN 'approved' THEN 'approved'
  WHEN 'rejected' THEN 'rejected'
  WHEN 'not_required' THEN 'not_required'
  ELSE brand_legal_approval
END
WHERE brand_legal_approval IS NOT NULL;

UPDATE dam_assets
SET asset_status = CASE normalize_dam_enum_token(asset_status)
  WHEN 'active' THEN 'active'
  WHEN 'draft' THEN 'draft'
  WHEN 'archived' THEN 'archived'
  WHEN 'retired' THEN 'retired'
  ELSE asset_status
END
WHERE asset_status IS NOT NULL;

UPDATE dam_assets
SET artwork_type = CASE normalize_dam_enum_token(artwork_type)
  WHEN 'label' THEN 'label'
  WHEN 'carton' THEN 'carton'
  WHEN 'shipper' THEN 'shipper'
  WHEN 'display' THEN 'display'
  WHEN 'digital' THEN 'digital'
  WHEN 'sell_sheet' THEN 'sell_sheet'
  WHEN 'other' THEN 'other'
  ELSE artwork_type
END
WHERE artwork_type IS NOT NULL;

UPDATE dam_assets
SET color_profile = CASE normalize_dam_enum_token(color_profile)
  WHEN 'cmyk' THEN 'cmyk'
  WHEN 'rgb' THEN 'rgb'
  WHEN 'pms' THEN 'pms'
  WHEN 'pantone' THEN 'pms'
  WHEN 'spot' THEN 'spot'
  WHEN 'spot_color' THEN 'spot'
  ELSE color_profile
END
WHERE color_profile IS NOT NULL;

UPDATE dam_assets
SET print_vs_digital = CASE normalize_dam_enum_token(print_vs_digital)
  WHEN 'print' THEN 'print'
  WHEN 'digital' THEN 'digital'
  WHEN 'omnichannel' THEN 'omnichannel'
  WHEN 'omni_channel' THEN 'omnichannel'
  ELSE print_vs_digital
END
WHERE print_vs_digital IS NOT NULL;

UPDATE dam_assets
SET license_ownership = CASE normalize_dam_enum_token(license_ownership)
  WHEN 'work_for_hire' THEN 'work_for_hire'
  WHEN 'ugc_license' THEN 'ugc_license'
  WHEN 'licensed' THEN 'licensed'
  WHEN 'owned' THEN 'owned'
  WHEN 'rights_managed' THEN 'rights_managed'
  ELSE license_ownership
END
WHERE license_ownership IS NOT NULL;

UPDATE dam_assets
SET endorsement_type = CASE normalize_dam_enum_token(endorsement_type)
  WHEN 'athlete' THEN 'athlete'
  WHEN 'influencer' THEN 'influencer'
  WHEN 'creator' THEN 'creator'
  WHEN 'expert' THEN 'expert'
  WHEN 'practitioner' THEN 'expert'
  WHEN 'expert_practitioner' THEN 'expert'
  WHEN 'none' THEN 'none'
  ELSE endorsement_type
END
WHERE endorsement_type IS NOT NULL;

UPDATE dam_assets
SET wada_risk_level = CASE normalize_dam_enum_token(wada_risk_level)
  WHEN 'none' THEN 'none'
  WHEN 'low' THEN 'low'
  WHEN 'medium' THEN 'medium'
  WHEN 'high' THEN 'high'
  ELSE wada_risk_level
END
WHERE wada_risk_level IS NOT NULL;

DROP FUNCTION normalize_dam_enum_token(TEXT);

COMMIT;
