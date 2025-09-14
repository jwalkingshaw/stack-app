export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          kinde_org_id: string;
          name: string;
          slug: string;
          storage_used: number;
          storage_limit: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          kinde_org_id: string;
          name: string;
          slug: string;
          storage_used?: number;
          storage_limit?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          kinde_org_id?: string;
          name?: string;
          slug?: string;
          storage_used?: number;
          storage_limit?: number;
          created_at?: string;
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
    };
  };
}