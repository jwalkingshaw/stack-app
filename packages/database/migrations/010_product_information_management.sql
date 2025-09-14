-- Migration 010: Product Information Management (PIM) Schema
-- Single table approach for optimal performance and maintainability

-- Enable UUID extension (already exists, but safe to repeat)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Product Families table (Sports Nutrition classification like Akeneo)
CREATE TABLE IF NOT EXISTS product_families (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Protein, Creatine, Pre-Workout, Vitamins, etc.
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, name)
);

-- Main Products table (single table for all product types)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Product Type & Hierarchy
  type TEXT NOT NULL CHECK (type IN ('parent', 'variant', 'standalone')),
  parent_id UUID REFERENCES products(id) ON DELETE CASCADE,
  has_variants BOOLEAN DEFAULT FALSE,
  variant_count INTEGER DEFAULT 0,
  
  -- Core Product Data (from PIM table)
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  upc TEXT,
  brand_line TEXT,
  family_id UUID REFERENCES product_families(id),
  
  -- Variant Attributes (JSONB for flexibility)
  variant_axis JSONB DEFAULT '{}', -- {flavor: "Chocolate", size: "5lb", color: "Red"}
  
  -- Pricing & Business Data
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Inactive', 'Discontinued')),
  launch_date DATE,
  msrp DECIMAL(10,2),
  cost_of_goods DECIMAL(10,2),
  margin_percent INTEGER,
  
  -- Content & Asset Management
  assets_count INTEGER DEFAULT 0,
  content_score INTEGER DEFAULT 0 CHECK (content_score >= 0 AND content_score <= 100),
  
  -- Product Description & Details
  short_description TEXT,
  long_description TEXT,
  features TEXT[], -- Array of key features
  specifications JSONB DEFAULT '{}', -- Flexible spec storage
  
  -- SEO & Marketing
  meta_title TEXT,
  meta_description TEXT,
  keywords TEXT[],
  
  -- Inventory & Logistics
  weight_g INTEGER, -- Weight in grams
  dimensions JSONB DEFAULT '{}', -- {length: 10, width: 5, height: 3, unit: "cm"}
  
  -- Content Inheritance (for variants)
  inheritance JSONB DEFAULT '{}', -- {productName: 'override', brandLine: 'inherit'}
  is_inherited JSONB DEFAULT '{}', -- {brandLine: true, productName: false}
  
  -- Marketplace Content (JSONB for flexibility)
  marketplace_content JSONB DEFAULT '{}', -- {amazon: {title: "", bullets: []}, walmart: {}}
  
  -- Audit Trail
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_modified_by TEXT,
  
  -- Constraints
  UNIQUE(organization_id, sku)
);

-- Product-Asset relationships (many-to-many)
CREATE TABLE IF NOT EXISTS product_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES dam_assets(id) ON DELETE CASCADE,
  asset_type TEXT DEFAULT 'general' CHECK (asset_type IN ('primary', 'gallery', 'thumbnail', 'technical', 'marketing', 'general')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(product_id, asset_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_organization_id ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_parent_id ON products(parent_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_family_id ON products(family_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN(
  to_tsvector('english', product_name || ' ' || sku || ' ' || COALESCE(brand_line, '') || ' ' || COALESCE(short_description, ''))
);

-- Family indexes
CREATE INDEX IF NOT EXISTS idx_product_families_organization_id ON product_families(organization_id);

-- Asset relationship indexes
CREATE INDEX IF NOT EXISTS idx_product_assets_product_id ON product_assets(product_id);
CREATE INDEX IF NOT EXISTS idx_product_assets_asset_id ON product_assets(asset_id);

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at 
  BEFORE UPDATE ON products 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_families_updated_at ON product_families;
CREATE TRIGGER update_product_families_updated_at 
  BEFORE UPDATE ON product_families 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update variant count when variants are added/removed
CREATE OR REPLACE FUNCTION update_variant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.type = 'variant' AND NEW.parent_id IS NOT NULL THEN
    UPDATE products 
    SET variant_count = variant_count + 1,
        has_variants = true
    WHERE id = NEW.parent_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.type = 'variant' AND OLD.parent_id IS NOT NULL THEN
    UPDATE products 
    SET variant_count = variant_count - 1
    WHERE id = OLD.parent_id;
    
    -- Update has_variants if no more variants
    UPDATE products 
    SET has_variants = false
    WHERE id = OLD.parent_id AND variant_count = 0;
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for variant count tracking
DROP TRIGGER IF EXISTS update_variant_count_on_insert ON products;
CREATE TRIGGER update_variant_count_on_insert 
  AFTER INSERT ON products 
  FOR EACH ROW EXECUTE FUNCTION update_variant_count();

DROP TRIGGER IF EXISTS update_variant_count_on_delete ON products;
CREATE TRIGGER update_variant_count_on_delete 
  AFTER DELETE ON products 
  FOR EACH ROW EXECUTE FUNCTION update_variant_count();

-- Function to update assets_count when product-asset relationships change
CREATE OR REPLACE FUNCTION update_product_assets_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products 
    SET assets_count = assets_count + 1 
    WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products 
    SET assets_count = assets_count - 1 
    WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for assets count tracking
DROP TRIGGER IF EXISTS update_assets_count_on_insert ON product_assets;
CREATE TRIGGER update_assets_count_on_insert 
  AFTER INSERT ON product_assets 
  FOR EACH ROW EXECUTE FUNCTION update_product_assets_count();

DROP TRIGGER IF EXISTS update_assets_count_on_delete ON product_assets;
CREATE TRIGGER update_assets_count_on_delete 
  AFTER DELETE ON product_assets 
  FOR EACH ROW EXECUTE FUNCTION update_product_assets_count();

-- Enable RLS on new tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies (permissive for now, will refine with proper auth)
CREATE POLICY "Users can access products" ON products FOR ALL USING (true);
CREATE POLICY "Users can access product families" ON product_families FOR ALL USING (true);
CREATE POLICY "Users can access product assets" ON product_assets FOR ALL USING (true);

-- Insert demo families for sports nutrition
DO $$
DECLARE
  demo_org_id UUID;
BEGIN
  -- Get the demo organization ID
  SELECT id INTO demo_org_id FROM organizations WHERE slug = 'demo-org' LIMIT 1;
  
  IF demo_org_id IS NOT NULL THEN
    INSERT INTO product_families (organization_id, name, description, created_by) VALUES
    (demo_org_id, 'Protein', 'Protein powders, bars, and supplements for muscle building and recovery', 'system'),
    (demo_org_id, 'Pre-Workout', 'Energy and focus supplements taken before exercise', 'system'),
    (demo_org_id, 'Post-Workout', 'Recovery supplements taken after exercise', 'system'),
    (demo_org_id, 'Creatine', 'Creatine monohydrate and creatine blends for strength and power', 'system'),
    (demo_org_id, 'Vitamins', 'Daily vitamins, minerals, and micronutrients', 'system'),
    (demo_org_id, 'Fat Burners', 'Weight management and thermogenic supplements', 'system'),
    (demo_org_id, 'Amino Acids', 'BCAA, EAA, and individual amino acid supplements', 'system'),
    (demo_org_id, 'Health & Wellness', 'General health supplements and superfoods', 'system')
    ON CONFLICT (organization_id, name) DO NOTHING;
  END IF;
END $$;