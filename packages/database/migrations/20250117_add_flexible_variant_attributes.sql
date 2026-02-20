-- Add Flexible Variant Attributes
-- This migration adds support for flexible variant attributes with suggested values

-- Add suggested values tracking table
CREATE TABLE IF NOT EXISTS variant_attribute_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    attribute_name TEXT NOT NULL, -- e.g., 'flavor', 'size', 'format'
    suggested_value TEXT NOT NULL, -- e.g., 'chocolate', '2lb', 'powder'
    usage_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, attribute_name, suggested_value)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_variant_attribute_suggestions_org_attr
ON variant_attribute_suggestions(organization_id, attribute_name);

CREATE INDEX IF NOT EXISTS idx_variant_attribute_suggestions_usage
ON variant_attribute_suggestions(organization_id, attribute_name, usage_count DESC);

-- Enable RLS
ALTER TABLE variant_attribute_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policy for variant_attribute_suggestions
CREATE POLICY variant_attribute_suggestions_tenant_isolation ON variant_attribute_suggestions
    USING (organization_id = current_setting('app.current_tenant_id')::uuid);

-- Function to update suggestion usage count
CREATE OR REPLACE FUNCTION update_variant_suggestion_usage(
    org_id UUID,
    attr_name TEXT,
    attr_value TEXT
) RETURNS void AS $$
BEGIN
    INSERT INTO variant_attribute_suggestions (organization_id, attribute_name, suggested_value, usage_count)
    VALUES (org_id, attr_name, attr_value, 1)
    ON CONFLICT (organization_id, attribute_name, suggested_value)
    DO UPDATE SET
        usage_count = variant_attribute_suggestions.usage_count + 1,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get suggestions for an attribute
CREATE OR REPLACE FUNCTION get_variant_suggestions(
    org_id UUID,
    attr_name TEXT,
    search_term TEXT DEFAULT '',
    limit_count INTEGER DEFAULT 10
) RETURNS TABLE (
    suggested_value TEXT,
    usage_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        vas.suggested_value,
        vas.usage_count
    FROM variant_attribute_suggestions vas
    WHERE vas.organization_id = org_id
        AND vas.attribute_name = attr_name
        AND (search_term = '' OR vas.suggested_value ILIKE '%' || search_term || '%')
    ORDER BY vas.usage_count DESC, vas.suggested_value ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON TABLE variant_attribute_suggestions IS 'Stores suggested values for variant attributes based on organization usage patterns';
COMMENT ON FUNCTION update_variant_suggestion_usage IS 'Updates usage count for variant attribute suggestions';
COMMENT ON FUNCTION get_variant_suggestions IS 'Returns suggested values for a variant attribute with usage-based ranking';