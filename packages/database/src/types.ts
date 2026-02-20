export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          type: 'business';
          organization_type: 'brand' | 'partner';
          partner_category: 'retailer' | 'distributor' | 'wholesaler' | null;
          metadata: Record<string, any> | null;
          created_at: string;
          updated_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          type: 'business';
          organization_type?: 'brand' | 'partner';
          partner_category?: 'retailer' | 'distributor' | 'wholesaler' | null;
          metadata?: Record<string, any> | null;
          created_at?: string;
          updated_at?: string;
          created_by: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          type?: 'business';
          organization_type?: 'brand' | 'partner';
          partner_category?: 'retailer' | 'distributor' | 'wholesaler' | null;
          metadata?: Record<string, any> | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string;
        };
      };
      product_families: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          code: string;
          require_sku_on_active: boolean | null;
          require_barcode_on_active: boolean | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          code: string;
          require_sku_on_active?: boolean | null;
          require_barcode_on_active?: boolean | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          code?: string;
          require_sku_on_active?: boolean | null;
          require_barcode_on_active?: boolean | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          type: 'parent' | 'variant' | 'standalone';
          parent_id: string | null;
          has_variants: boolean;
          variant_count: number;
          product_name: string;
          scin: string;
          sku: string | null;
          barcode: string | null;
          upc: string | null;
          brand_line: string | null;
          family_id: string | null;
          variant_axis: Record<string, any>;
          status: 'Draft' | 'Enrichment' | 'Review' | 'Active' | 'Discontinued' | 'Archived';
          launch_date: string | null;
          msrp: number | null;
          cost_of_goods: number | null;
          margin_percent: number | null;
          assets_count: number;
          content_score: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          last_modified_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          type: 'parent' | 'variant' | 'standalone';
          parent_id?: string | null;
          has_variants?: boolean;
          variant_count?: number;
          product_name: string;
          scin?: string;
          sku?: string | null;
          barcode?: string | null;
          upc?: string | null;
          brand_line?: string | null;
          family_id?: string | null;
          variant_axis?: Record<string, any>;
          status?: 'Draft' | 'Enrichment' | 'Review' | 'Active' | 'Discontinued' | 'Archived';
          launch_date?: string | null;
          msrp?: number | null;
          cost_of_goods?: number | null;
          margin_percent?: number | null;
          assets_count?: number;
          content_score?: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          last_modified_by?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          type?: 'parent' | 'variant' | 'standalone';
          parent_id?: string | null;
          has_variants?: boolean;
          variant_count?: number;
          product_name?: string;
          scin?: string;
          sku?: string | null;
          barcode?: string | null;
          upc?: string | null;
          brand_line?: string | null;
          family_id?: string | null;
          variant_axis?: Record<string, any>;
          status?: 'Draft' | 'Enrichment' | 'Review' | 'Active' | 'Discontinued' | 'Archived';
          launch_date?: string | null;
          msrp?: number | null;
          cost_of_goods?: number | null;
          margin_percent?: number | null;
          assets_count?: number;
          content_score?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          last_modified_by?: string | null;
        };
      };
      field_groups: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          name: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_fields: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          label: string;
          field_type: string;
          is_required: boolean;
          is_unique: boolean;
          is_localizable: boolean;
          is_channelable: boolean;
          sort_order: number;
          default_value: string;
          validation_rules: Record<string, any>;
          options: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          label: string;
          field_type: string;
          is_required?: boolean;
          is_unique?: boolean;
          is_localizable?: boolean;
          is_channelable?: boolean;
          sort_order?: number;
          default_value?: string;
          validation_rules?: Record<string, any>;
          options?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          code?: string;
          label?: string;
          field_type?: string;
          is_required?: boolean;
          is_unique?: boolean;
          is_localizable?: boolean;
          is_channelable?: boolean;
          sort_order?: number;
          default_value?: string;
          validation_rules?: Record<string, any>;
          options?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      channels: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          code?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      locales: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          code?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      countries: {
        Row: {
          code: string;
          name: string;
        };
        Insert: {
          code: string;
          name: string;
        };
        Update: {
          code?: string;
          name?: string;
        };
      };
      country_locales: {
        Row: {
          id: string;
          country_code: string;
          locale_code: string;
          locale_name: string;
          is_primary: boolean;
        };
        Insert: {
          id?: string;
          country_code: string;
          locale_code: string;
          locale_name: string;
          is_primary?: boolean;
        };
        Update: {
          id?: string;
          country_code?: string;
          locale_code?: string;
          locale_name?: string;
          is_primary?: boolean;
        };
      };
      markets: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          is_active: boolean;
          is_default: boolean;
          currency_code: string | null;
          timezone: string | null;
          default_locale_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          name: string;
          is_active?: boolean;
          is_default?: boolean;
          currency_code?: string | null;
          timezone?: string | null;
          default_locale_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          code?: string;
          name?: string;
          is_active?: boolean;
          is_default?: boolean;
          currency_code?: string | null;
          timezone?: string | null;
          default_locale_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      market_locales: {
        Row: {
          id: string;
          market_id: string;
          locale_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          market_id: string;
          locale_id: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          market_id?: string;
          locale_id?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      channel_locales: {
        Row: {
          id: string;
          channel_id: string;
          locale_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          locale_id: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          channel_id?: string;
          locale_id?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_field_channels: {
        Row: {
          id: string;
          product_field_id: string;
          channel_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_field_id: string;
          channel_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_field_id?: string;
          channel_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_field_locales: {
        Row: {
          id: string;
          product_field_id: string;
          locale_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_field_id: string;
          locale_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_field_id?: string;
          locale_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_field_markets: {
        Row: {
          id: string;
          product_field_id: string;
          market_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_field_id: string;
          market_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_field_id?: string;
          market_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_organizations: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: 'owner' | 'admin' | 'member';
          status: 'active' | 'inactive' | 'invited';
          invited_by: string | null;
          invited_at: string | null;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role: 'owner' | 'admin' | 'member';
          status?: 'active' | 'inactive' | 'invited';
          invited_by?: string | null;
          invited_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          role?: 'owner' | 'admin' | 'member';
          status?: 'active' | 'inactive' | 'invited';
          invited_by?: string | null;
          invited_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      dam_folders: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          parent_id: string | null;
          path: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          parent_id?: string | null;
          path: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          parent_id?: string | null;
          path?: string;
          created_by?: string;
          created_at?: string;
        };
      };
      dam_assets: {
        Row: {
          id: string;
          organization_id: string;
          folder_id: string | null;
          filename: string;
          original_filename: string;
          file_type: string;
          file_size: number;
          mime_type: string;
          s3_key: string;
          s3_url: string;
          thumbnail_urls: any;
          metadata: any;
          tags: string[];
          description: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          folder_id?: string | null;
          filename: string;
          original_filename: string;
          file_type: string;
          file_size: number;
          mime_type: string;
          s3_key: string;
          s3_url: string;
          thumbnail_urls?: any;
          metadata?: any;
          tags?: string[];
          description?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          folder_id?: string | null;
          filename?: string;
          original_filename?: string;
          file_type?: string;
          file_size?: number;
          mime_type?: string;
          s3_key?: string;
          s3_url?: string;
          thumbnail_urls?: any;
          metadata?: any;
          tags?: string[];
          description?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      dam_collections: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          asset_ids: string[];
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          asset_ids?: string[];
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          asset_ids?: string[];
          created_by?: string;
          created_at?: string;
        };
      };
      brand_partner_relationships: {
        Row: {
          id: string;
          brand_organization_id: string;
          partner_organization_id: string;
          access_level: 'view' | 'edit';
          invited_by: string;
          created_at: string;
          status: 'active' | 'suspended' | 'revoked';
          status_updated_at: string | null;
          settings: Record<string, any>;
        };
        Insert: {
          id?: string;
          brand_organization_id: string;
          partner_organization_id: string;
          access_level?: 'view' | 'edit';
          invited_by: string;
          created_at?: string;
          status?: 'active' | 'suspended' | 'revoked';
          status_updated_at?: string | null;
          settings?: Record<string, any>;
        };
        Update: {
          id?: string;
          brand_organization_id?: string;
          partner_organization_id?: string;
          access_level?: 'view' | 'edit';
          invited_by?: string;
          created_at?: string;
          status?: 'active' | 'suspended' | 'revoked';
          status_updated_at?: string | null;
          settings?: Record<string, any>;
        };
      };
    };
  };
}

// Convenience type exports
export type Organization = Database['public']['Tables']['organizations']['Row'];
export type ProductFamily = Database['public']['Tables']['product_families']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type FieldGroup = Database['public']['Tables']['field_groups']['Row'];
export type ProductField = Database['public']['Tables']['product_fields']['Row'];
export type UserOrganization = Database['public']['Tables']['user_organizations']['Row'];
export type DamFolder = Database['public']['Tables']['dam_folders']['Row'];
export type DamAsset = Database['public']['Tables']['dam_assets']['Row'];
export type DamCollection = Database['public']['Tables']['dam_collections']['Row'];
export type BrandPartnerRelationship = Database['public']['Tables']['brand_partner_relationships']['Row'];

// Insert types
export type OrganizationInsert = Database['public']['Tables']['organizations']['Insert'];
export type ProductFamilyInsert = Database['public']['Tables']['product_families']['Insert'];
export type ProductInsert = Database['public']['Tables']['products']['Insert'];
export type FieldGroupInsert = Database['public']['Tables']['field_groups']['Insert'];
export type ProductFieldInsert = Database['public']['Tables']['product_fields']['Insert'];
export type UserOrganizationInsert = Database['public']['Tables']['user_organizations']['Insert'];
export type DamFolderInsert = Database['public']['Tables']['dam_folders']['Insert'];
export type DamAssetInsert = Database['public']['Tables']['dam_assets']['Insert'];
export type DamCollectionInsert = Database['public']['Tables']['dam_collections']['Insert'];
export type BrandPartnerRelationshipInsert = Database['public']['Tables']['brand_partner_relationships']['Insert'];

// Update types
export type OrganizationUpdate = Database['public']['Tables']['organizations']['Update'];
export type ProductFamilyUpdate = Database['public']['Tables']['product_families']['Update'];
export type ProductUpdate = Database['public']['Tables']['products']['Update'];
export type FieldGroupUpdate = Database['public']['Tables']['field_groups']['Update'];
export type ProductFieldUpdate = Database['public']['Tables']['product_fields']['Update'];
export type UserOrganizationUpdate = Database['public']['Tables']['user_organizations']['Update'];
export type DamFolderUpdate = Database['public']['Tables']['dam_folders']['Update'];
export type DamAssetUpdate = Database['public']['Tables']['dam_assets']['Update'];
export type DamCollectionUpdate = Database['public']['Tables']['dam_collections']['Update'];
export type BrandPartnerRelationshipUpdate = Database['public']['Tables']['brand_partner_relationships']['Update'];
