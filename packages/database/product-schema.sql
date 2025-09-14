-- Product Information Management (PIM) Schema Extension
-- This extends the existing DAM schema with product tables
-- Run this AFTER the main supabase-schema.sql

-- Enable UUID extension (already exists, but safe to repeat)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Product Categories table (hierarchical)
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
  path TEXT NOT NULL, -- Computed path like "/Sports Nutrition/Protein"
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Families table (Sports Nutrition classification like Akeneo)
CREATE TABLE IF NOT EXISTS product_families (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Protein, Creatine, Pre-Workout, Vitamins, etc.
  description TEXT,
  attribute_template JSONB DEFAULT '{}', -- Template for required/optional fields
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Main Products table
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
  category_id UUID REFERENCES product_categories(id),
  family_id UUID REFERENCES product_families(id),
  
  -- Variant Attributes (stored as JSONB for flexibility)
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
  shipping_class TEXT,
  
  -- Content Inheritance (for variants)
  inheritance JSONB DEFAULT '{}', -- {productName: 'override', brandLine: 'inherit', category: 'inherit'}
  is_inherited JSONB DEFAULT '{}', -- {brandLine: true, category: true, productName: false}
  
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
  
  UNIQUE(product_id, asset_id, asset_type)
);

-- Marketplace-specific content (Amazon, Walmart, etc.)
CREATE TABLE IF NOT EXISTS product_marketplace_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL, -- 'amazon', 'walmart', 'mercadolibre'
  
  -- Marketplace-specific fields (flexible JSONB)
  title TEXT,
  description TEXT,
  bullet_points TEXT[],
  keywords TEXT[],
  category_path TEXT,
  attributes JSONB DEFAULT '{}', -- Marketplace-specific attributes
  
  -- Inheritance behavior
  inherits_from_parent BOOLEAN DEFAULT TRUE,
  override_fields TEXT[] DEFAULT '{}', -- Fields that override parent content
  
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(product_id, marketplace)
);

-- Product Collections (similar to asset collections)
CREATE TABLE IF NOT EXISTS product_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  product_ids UUID[] DEFAULT '{}',
  collection_type TEXT DEFAULT 'manual' CHECK (collection_type IN ('manual', 'smart', 'campaign')),
  smart_rules JSONB DEFAULT '{}', -- For smart collections
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_organization_id ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_parent_id ON products(parent_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_family_id ON products(family_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN(
  to_tsvector('english', product_name || ' ' || sku || ' ' || COALESCE(brand_line, '') || ' ' || COALESCE(short_description, ''))
);

-- Category indexes
CREATE INDEX IF NOT EXISTS idx_product_categories_organization_id ON product_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_parent_id ON product_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_path ON product_categories(path);

-- Family indexes
CREATE INDEX IF NOT EXISTS idx_product_families_organization_id ON product_families(organization_id);

-- Asset relationship indexes
CREATE INDEX IF NOT EXISTS idx_product_assets_product_id ON product_assets(product_id);
CREATE INDEX IF NOT EXISTS idx_product_assets_asset_id ON product_assets(asset_id);

-- Marketplace content indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_content_product_id ON product_marketplace_content(product_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_content_marketplace ON product_marketplace_content(marketplace);

-- Collection indexes
CREATE INDEX IF NOT EXISTS idx_product_collections_organization_id ON product_collections(organization_id);

-- Add updated_at triggers for new tables
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at 
  BEFORE UPDATE ON products 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_categories_updated_at ON product_categories;
CREATE TRIGGER update_product_categories_updated_at 
  BEFORE UPDATE ON product_categories 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_families_updated_at ON product_families;
CREATE TRIGGER update_product_families_updated_at 
  BEFORE UPDATE ON product_families 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_marketplace_content_updated_at ON product_marketplace_content;
CREATE TRIGGER update_marketplace_content_updated_at 
  BEFORE UPDATE ON product_marketplace_content 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_collections_updated_at ON product_collections;
CREATE TRIGGER update_product_collections_updated_at 
  BEFORE UPDATE ON product_collections 
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
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_marketplace_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_collections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Products
DROP POLICY IF EXISTS "Users can view products in their organizations" ON products;
CREATE POLICY "Users can view products in their organizations" ON products
  FOR SELECT USING (true); -- TODO: Refine with proper org checks

DROP POLICY IF EXISTS "Users can insert products in their organizations" ON products;
CREATE POLICY "Users can insert products in their organizations" ON products
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update products in their organizations" ON products;
CREATE POLICY "Users can update products in their organizations" ON products
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete products in their organizations" ON products;
CREATE POLICY "Users can delete products in their organizations" ON products
  FOR DELETE USING (true);

-- Similar policies for other tables (keeping them permissive for now)
CREATE POLICY "Users can access product categories" ON product_categories FOR ALL USING (true);
CREATE POLICY "Users can access product families" ON product_families FOR ALL USING (true);
CREATE POLICY "Users can access product assets" ON product_assets FOR ALL USING (true);
CREATE POLICY "Users can access marketplace content" ON product_marketplace_content FOR ALL USING (true);
CREATE POLICY "Users can access product collections" ON product_collections FOR ALL USING (true);

-- Insert some demo families for sports nutrition
INSERT INTO product_families (organization_id, name, description, created_by)
SELECT 
  org.id,
  family.name,
  family.description,
  'system'
FROM organizations org,
VALUES 
  ('Protein', 'Protein powders, bars, and supplements for muscle building and recovery'),
  ('Pre-Workout', 'Energy and focus supplements taken before exercise'),
  ('Post-Workout', 'Recovery supplements taken after exercise'),
  ('Creatine', 'Creatine monohydrate and creatine blends for strength and power'),
  ('Vitamins', 'Daily vitamins, minerals, and micronutrients'),
  ('Fat Burners', 'Weight management and thermogenic supplements'),
  ('Amino Acids', 'BCAA, EAA, and individual amino acid supplements'),
  ('Health & Wellness', 'General health supplements and superfoods')
AS family(name, description)
WHERE org.slug = 'demo-org'
ON CONFLICT DO NOTHING;

-- Insert demo categories
INSERT INTO product_categories (organization_id, name, path, description, created_by)
SELECT 
  org.id,
  cat.name,
  cat.path,
  cat.description,
  'system'
FROM organizations org,
VALUES 
  ('Sports Nutrition', '/Sports Nutrition', 'Athletic performance and fitness supplements'),
  ('Health Supplements', '/Health Supplements', 'General health and wellness products'),
  ('Protein Powders', '/Sports Nutrition/Protein Powders', 'Whey, casein, and plant-based protein powders'),
  ('Energy Drinks', '/Sports Nutrition/Energy Drinks', 'Pre-workout drinks and energy formulas'),
  ('Recovery', '/Sports Nutrition/Recovery', 'Post-workout recovery supplements')
AS cat(name, path, description)
WHERE org.slug = 'demo-org'
ON CONFLICT DO NOTHING;