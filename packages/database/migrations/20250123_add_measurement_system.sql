-- Migration: Add measurement system tables
-- Date: 2025-01-23
-- Description: Creates measurement families and units for handling product measurements

-- Create measurement families table
CREATE TABLE measurement_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    standard_unit_id UUID, -- Will reference measurement_units.id
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Ensure unique codes per organization
    UNIQUE(organization_id, code)
);

-- Create measurement units table
CREATE TABLE measurement_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_family_id UUID NOT NULL REFERENCES measurement_families(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    conversion_factor DECIMAL(20, 10) NOT NULL DEFAULT 1.0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Ensure unique codes per measurement family
    UNIQUE(measurement_family_id, code)
);

-- Add foreign key constraint for standard_unit_id (after measurement_units table exists)
ALTER TABLE measurement_families
ADD CONSTRAINT fk_measurement_families_standard_unit
FOREIGN KEY (standard_unit_id) REFERENCES measurement_units(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_measurement_families_organization_id ON measurement_families(organization_id);
CREATE INDEX idx_measurement_families_code ON measurement_families(code);
CREATE INDEX idx_measurement_units_family_id ON measurement_units(measurement_family_id);
CREATE INDEX idx_measurement_units_code ON measurement_units(code);

-- Enable RLS (Row Level Security)
ALTER TABLE measurement_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_units ENABLE ROW LEVEL SECURITY;

-- RLS Policies for measurement_families
CREATE POLICY "Users can access measurement families from their organization" ON measurement_families
    FOR ALL USING (
        organization_id IN (
            SELECT id FROM organizations
            WHERE id = organization_id
        )
    );

-- RLS Policies for measurement_units
CREATE POLICY "Users can access measurement units from their organization" ON measurement_units
    FOR ALL USING (
        measurement_family_id IN (
            SELECT id FROM measurement_families
            WHERE organization_id IN (
                SELECT id FROM organizations
                WHERE id = measurement_families.organization_id
            )
        )
    );

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_measurement_families_updated_at BEFORE UPDATE ON measurement_families
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_measurement_units_updated_at BEFORE UPDATE ON measurement_units
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();