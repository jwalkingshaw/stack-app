export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      ai_action_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          ai_task_envelope_id: string | null
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          resource_id: string | null
          resource_type: string
          status: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          ai_task_envelope_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          resource_id?: string | null
          resource_type: string
          status?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          ai_task_envelope_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_audit_logs_ai_task_envelope_id_fkey"
            columns: ["ai_task_envelope_id"]
            isOneToOne: false
            referencedRelation: "ai_task_envelopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_task_envelopes: {
        Row: {
          actor_user_id: string | null
          allowed_actions: string[]
          approval_required: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          input_payload: Json
          metadata: Json
          model: string | null
          organization_id: string
          output_profile_id: string | null
          partner_organization_id: string | null
          product_ids: string[]
          provider: string | null
          referenced_asset_ids: string[]
          referenced_document_ids: string[]
          result_payload: Json
          status: string
          task_type: string
          updated_at: string
        }
        Insert: {
          actor_user_id?: string | null
          allowed_actions?: string[]
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          input_payload?: Json
          metadata?: Json
          model?: string | null
          organization_id: string
          output_profile_id?: string | null
          partner_organization_id?: string | null
          product_ids?: string[]
          provider?: string | null
          referenced_asset_ids?: string[]
          referenced_document_ids?: string[]
          result_payload?: Json
          status?: string
          task_type: string
          updated_at?: string
        }
        Update: {
          actor_user_id?: string | null
          allowed_actions?: string[]
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          input_payload?: Json
          metadata?: Json
          model?: string | null
          organization_id?: string
          output_profile_id?: string | null
          partner_organization_id?: string | null
          product_ids?: string[]
          provider?: string | null
          referenced_asset_ids?: string[]
          referenced_document_ids?: string[]
          result_payload?: Json
          status?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_task_envelopes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_envelopes_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_envelopes_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          path: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          path: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          path?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_category_assignments: {
        Row: {
          asset_id: string
          assigned_at: string
          assigned_by: string | null
          category_id: string
          id: string
          is_primary: boolean | null
        }
        Insert: {
          asset_id: string
          assigned_at?: string
          assigned_by?: string | null
          category_id: string
          id?: string
          is_primary?: boolean | null
        }
        Update: {
          asset_id?: string
          assigned_at?: string
          assigned_by?: string | null
          category_id?: string
          id?: string
          is_primary?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_category_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_category_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_scope_assignments: {
        Row: {
          asset_id: string
          channel_id: string | null
          created_at: string
          created_by: string | null
          destination_id: string | null
          id: string
          is_active: boolean
          locale_id: string | null
          market_id: string | null
          metadata: Json
          organization_id: string
          source: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          id?: string
          is_active?: boolean
          locale_id?: string | null
          market_id?: string | null
          metadata?: Json
          organization_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          id?: string
          is_active?: boolean
          locale_id?: string | null
          market_id?: string | null
          metadata?: Json
          organization_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_scope_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_scope_assignments_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_scope_assignments_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "channel_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_scope_assignments_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_scope_assignments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_scope_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_shares: {
        Row: {
          allow_downloads: boolean
          asset_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          organization_id: string
          public_enabled: boolean
          token: string
          updated_at: string
        }
        Insert: {
          allow_downloads?: boolean
          asset_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          organization_id: string
          public_enabled?: boolean
          token: string
          updated_at?: string
        }
        Update: {
          allow_downloads?: boolean
          asset_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          organization_id?: string
          public_enabled?: boolean
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_shares_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_shares_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_tag_assignments: {
        Row: {
          asset_id: string
          assigned_at: string
          assigned_by: string | null
          id: string
          tag_id: string
        }
        Insert: {
          asset_id: string
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          tag_id: string
        }
        Update: {
          asset_id?: string
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_tag_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "asset_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          affected_fields: string[] | null
          api_endpoint: string | null
          compliance_relevant: boolean | null
          duration_ms: number | null
          id: string
          ip_address: unknown
          kinde_user_id: string
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          organization_id: string | null
          resource_id: string | null
          resource_name: string | null
          resource_type: string
          risk_level: string | null
          session_id: string | null
          source_application: string | null
          tags: string[] | null
          timestamp: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          affected_fields?: string[] | null
          api_endpoint?: string | null
          compliance_relevant?: boolean | null
          duration_ms?: number | null
          id?: string
          ip_address?: unknown
          kinde_user_id: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type: string
          risk_level?: string | null
          session_id?: string | null
          source_application?: string | null
          tags?: string[] | null
          timestamp?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          affected_fields?: string[] | null
          api_endpoint?: string | null
          compliance_relevant?: boolean | null
          duration_ms?: number | null
          id?: string
          ip_address?: unknown
          kinde_user_id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string
          risk_level?: string | null
          session_id?: string | null
          source_application?: string | null
          tags?: string[] | null
          timestamp?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_addons: {
        Row: {
          created_at: string
          currency: string
          id: string
          increments: Json
          is_active: boolean
          monthly_price_cents: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id: string
          increments?: Json
          is_active?: boolean
          monthly_price_cents: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          increments?: Json
          is_active?: boolean
          monthly_price_cents?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_active: boolean
          is_custom: boolean
          limits: Json
          monthly_price_cents: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id: string
          is_active?: boolean
          is_custom?: boolean
          limits?: Json
          monthly_price_cents: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          is_custom?: boolean
          limits?: Json
          monthly_price_cents?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      billing_webhook_receipts: {
        Row: {
          attempt_count: number
          created_at: string
          error_message: string | null
          event_id: string
          event_type: string | null
          id: string
          last_attempt_at: string
          organization_id: string | null
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          event_id: string
          event_type?: string | null
          id?: string
          last_attempt_at?: string
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_type?: string | null
          id?: string
          last_attempt_at?: string
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_webhook_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_partner_relationships: {
        Row: {
          access_level: string
          brand_organization_id: string
          created_at: string
          id: string
          invited_by: string
          partner_organization_id: string
          settings: Json | null
          status: string
          status_updated_at: string | null
        }
        Insert: {
          access_level?: string
          brand_organization_id: string
          created_at?: string
          id?: string
          invited_by: string
          partner_organization_id: string
          settings?: Json | null
          status?: string
          status_updated_at?: string | null
        }
        Update: {
          access_level?: string
          brand_organization_id?: string
          created_at?: string
          id?: string
          invited_by?: string
          partner_organization_id?: string
          settings?: Json | null
          status?: string
          status_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_partner_relationships_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_partner_relationships_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_destinations: {
        Row: {
          channel_id: string | null
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          market_id: string | null
          name: string
          organization_id: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          channel_id?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          market_id?: string | null
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          channel_id?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          market_id?: string | null
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_destinations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_destinations_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_destinations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_locales: {
        Row: {
          channel_id: string
          created_at: string | null
          id: string
          is_active: boolean
          locale_id: string
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          locale_id: string
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          locale_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_locales_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_locales_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      country_locales: {
        Row: {
          country_code: string
          id: string
          is_primary: boolean
          locale_code: string
          locale_name: string
        }
        Insert: {
          country_code: string
          id?: string
          is_primary?: boolean
          locale_code: string
          locale_name: string
        }
        Update: {
          country_code?: string
          id?: string
          is_primary?: boolean
          locale_code?: string
          locale_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_locales_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      dam_asset_versions: {
        Row: {
          asset_id: string
          change_comment: string | null
          created_at: string
          created_by: string
          description: string | null
          effective_from: string | null
          effective_to: string | null
          file_size: number
          file_type: string
          filename: string
          id: string
          metadata: Json | null
          mime_type: string
          organization_id: string
          original_filename: string
          s3_key: string
          s3_url: string
          tags: string[] | null
          thumbnail_urls: Json | null
          version_number: number
        }
        Insert: {
          asset_id: string
          change_comment?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          file_size: number
          file_type: string
          filename: string
          id?: string
          metadata?: Json | null
          mime_type: string
          organization_id: string
          original_filename: string
          s3_key: string
          s3_url: string
          tags?: string[] | null
          thumbnail_urls?: Json | null
          version_number: number
        }
        Update: {
          asset_id?: string
          change_comment?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          file_size?: number
          file_type?: string
          filename?: string
          id?: string
          metadata?: Json | null
          mime_type?: string
          organization_id?: string
          original_filename?: string
          s3_key?: string
          s3_url?: string
          tags?: string[] | null
          thumbnail_urls?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "dam_asset_versions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dam_asset_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dam_assets: {
        Row: {
          alt_text: string | null
          approval_status: string | null
          artwork_type: string | null
          asset_kind: string | null
          asset_ref: string
          asset_scope: string | null
          asset_status: string
          asset_type: string | null
          athlete_names: string[]
          brand_legal_approval: string | null
          certificate_type: string | null
          certifications: string[]
          claims_approved_markets: string[]
          claims_review_status: string | null
          color_profile: string | null
          compliance_status: string | null
          created_at: string | null
          created_by: string
          current_version_changed_at: string | null
          current_version_changed_by: string | null
          current_version_comment: string | null
          current_version_effective_from: string | null
          current_version_effective_to: string | null
          current_version_number: number
          data_classification: string
          description: string | null
          detected_skus: Json | null
          document_type: string | null
          effective_version_policy: string
          endorsement_type: string | null
          expiration_date: string | null
          file_path: string | null
          file_size: number
          file_type: string
          filename: string
          folder_id: string | null
          formula_version: string | null
          ftc_disclosure_required: boolean | null
          height: number | null
          id: string
          label_panel_type: string | null
          label_version: string | null
          license_ownership: string | null
          metadata: Json | null
          mime_type: string
          organization_id: string | null
          original_filename: string
          print_vs_digital: string
          product_identifiers: string[] | null
          regulatory_region: string[]
          release_on_file: boolean | null
          resolution_dpi: number | null
          s3_key: string
          s3_url: string
          tags: string[] | null
          talent_contract_end: string | null
          talent_present: boolean | null
          thumbnail_urls: Json | null
          updated_at: string | null
          usage_end: string | null
          usage_platforms: string[]
          usage_platforms_note: string | null
          usage_territory: string | null
          visible_claims: string[]
          wada_risk_level: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          approval_status?: string | null
          artwork_type?: string | null
          asset_kind?: string | null
          asset_ref: string
          asset_scope?: string | null
          asset_status?: string
          asset_type?: string | null
          athlete_names?: string[]
          brand_legal_approval?: string | null
          certificate_type?: string | null
          certifications?: string[]
          claims_approved_markets?: string[]
          claims_review_status?: string | null
          color_profile?: string | null
          compliance_status?: string | null
          created_at?: string | null
          created_by: string
          current_version_changed_at?: string | null
          current_version_changed_by?: string | null
          current_version_comment?: string | null
          current_version_effective_from?: string | null
          current_version_effective_to?: string | null
          current_version_number?: number
          data_classification?: string
          description?: string | null
          detected_skus?: Json | null
          document_type?: string | null
          effective_version_policy?: string
          endorsement_type?: string | null
          expiration_date?: string | null
          file_path?: string | null
          file_size: number
          file_type: string
          filename: string
          folder_id?: string | null
          formula_version?: string | null
          ftc_disclosure_required?: boolean | null
          height?: number | null
          id?: string
          label_panel_type?: string | null
          label_version?: string | null
          license_ownership?: string | null
          metadata?: Json | null
          mime_type: string
          organization_id?: string | null
          original_filename: string
          print_vs_digital?: string
          product_identifiers?: string[] | null
          regulatory_region?: string[]
          release_on_file?: boolean | null
          resolution_dpi?: number | null
          s3_key: string
          s3_url: string
          tags?: string[] | null
          talent_contract_end?: string | null
          talent_present?: boolean | null
          thumbnail_urls?: Json | null
          updated_at?: string | null
          usage_end?: string | null
          usage_platforms?: string[]
          usage_platforms_note?: string | null
          usage_territory?: string | null
          visible_claims?: string[]
          wada_risk_level?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          approval_status?: string | null
          artwork_type?: string | null
          asset_kind?: string | null
          asset_ref?: string
          asset_scope?: string | null
          asset_status?: string
          asset_type?: string | null
          athlete_names?: string[]
          brand_legal_approval?: string | null
          certificate_type?: string | null
          certifications?: string[]
          claims_approved_markets?: string[]
          claims_review_status?: string | null
          color_profile?: string | null
          compliance_status?: string | null
          created_at?: string | null
          created_by?: string
          current_version_changed_at?: string | null
          current_version_changed_by?: string | null
          current_version_comment?: string | null
          current_version_effective_from?: string | null
          current_version_effective_to?: string | null
          current_version_number?: number
          data_classification?: string
          description?: string | null
          detected_skus?: Json | null
          document_type?: string | null
          effective_version_policy?: string
          endorsement_type?: string | null
          expiration_date?: string | null
          file_path?: string | null
          file_size?: number
          file_type?: string
          filename?: string
          folder_id?: string | null
          formula_version?: string | null
          ftc_disclosure_required?: boolean | null
          height?: number | null
          id?: string
          label_panel_type?: string | null
          label_version?: string | null
          license_ownership?: string | null
          metadata?: Json | null
          mime_type?: string
          organization_id?: string | null
          original_filename?: string
          print_vs_digital?: string
          product_identifiers?: string[] | null
          regulatory_region?: string[]
          release_on_file?: boolean | null
          resolution_dpi?: number | null
          s3_key?: string
          s3_url?: string
          tags?: string[] | null
          talent_contract_end?: string | null
          talent_present?: boolean | null
          thumbnail_urls?: Json | null
          updated_at?: string | null
          usage_end?: string | null
          usage_platforms?: string[]
          usage_platforms_note?: string | null
          usage_territory?: string | null
          visible_claims?: string[]
          wada_risk_level?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dam_assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "dam_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dam_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dam_collections: {
        Row: {
          asset_ids: string[] | null
          created_at: string | null
          created_by: string
          description: string | null
          folder_ids: string[]
          id: string
          name: string
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          asset_ids?: string[] | null
          created_at?: string | null
          created_by: string
          description?: string | null
          folder_ids?: string[]
          id?: string
          name: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          asset_ids?: string[] | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          folder_ids?: string[]
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dam_collections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dam_folders: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          name: string
          organization_id: string | null
          parent_id: string | null
          path: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          name: string
          organization_id?: string | null
          parent_id?: string | null
          path: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          name?: string
          organization_id?: string | null
          parent_id?: string | null
          path?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dam_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dam_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "dam_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_subscribers: {
        Row: {
          created_at: string | null
          email: string
          id: string
          metadata: Json | null
          signup_source: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          metadata?: Json | null
          signup_source: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          metadata?: Json | null
          signup_source?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      family_attributes: {
        Row: {
          attribute_code: string
          attribute_label: string
          attribute_options: Json | null
          attribute_type: string
          created_at: string | null
          display_order: number | null
          family_id: string
          help_text: string | null
          id: string
          inherit_level_1: boolean | null
          inherit_level_2: boolean | null
          is_required: boolean | null
          is_unique: boolean | null
          organization_id: string
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          attribute_code: string
          attribute_label: string
          attribute_options?: Json | null
          attribute_type?: string
          created_at?: string | null
          display_order?: number | null
          family_id: string
          help_text?: string | null
          id?: string
          inherit_level_1?: boolean | null
          inherit_level_2?: boolean | null
          is_required?: boolean | null
          is_unique?: boolean | null
          organization_id: string
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          attribute_code?: string
          attribute_label?: string
          attribute_options?: Json | null
          attribute_type?: string
          created_at?: string | null
          display_order?: number | null
          family_id?: string
          help_text?: string | null
          id?: string
          inherit_level_1?: boolean | null
          inherit_level_2?: boolean | null
          is_required?: boolean | null
          is_unique?: boolean | null
          organization_id?: string
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "family_attributes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_attributes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      family_variants: {
        Row: {
          common_attributes: string[] | null
          created_at: string | null
          description: string | null
          family_id: string
          id: string
          level_1_attributes: string[] | null
          level_1_axes: string[] | null
          level_2_attributes: string[] | null
          level_2_axes: string[] | null
          max_variant_levels: number | null
          organization_id: string
          updated_at: string | null
          variant_code: string
          variant_name: string
        }
        Insert: {
          common_attributes?: string[] | null
          created_at?: string | null
          description?: string | null
          family_id: string
          id?: string
          level_1_attributes?: string[] | null
          level_1_axes?: string[] | null
          level_2_attributes?: string[] | null
          level_2_axes?: string[] | null
          max_variant_levels?: number | null
          organization_id: string
          updated_at?: string | null
          variant_code: string
          variant_name: string
        }
        Update: {
          common_attributes?: string[] | null
          created_at?: string | null
          description?: string | null
          family_id?: string
          id?: string
          level_1_attributes?: string[] | null
          level_1_axes?: string[] | null
          level_2_attributes?: string[] | null
          level_2_axes?: string[] | null
          max_variant_levels?: number | null
          organization_id?: string
          updated_at?: string | null
          variant_code?: string
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_variants_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          description: string
          id: string
          status: string
          submitter_email: string
          submitter_name: string
          title: string
          updated_at: string | null
          vote_count: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description: string
          id?: string
          status?: string
          submitter_email: string
          submitter_name: string
          title: string
          updated_at?: string | null
          vote_count?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string
          id?: string
          status?: string
          submitter_email?: string
          submitter_name?: string
          title?: string
          updated_at?: string | null
          vote_count?: number | null
        }
        Relationships: []
      }
      feature_votes: {
        Row: {
          created_at: string | null
          feature_request_id: string | null
          id: string
          voter_identifier: string
          voter_name: string | null
        }
        Insert: {
          created_at?: string | null
          feature_request_id?: string | null
          id?: string
          voter_identifier: string
          voter_name?: string | null
        }
        Update: {
          created_at?: string | null
          feature_request_id?: string | null
          id?: string
          voter_identifier?: string
          voter_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_votes_feature_request_id_fkey"
            columns: ["feature_request_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      field_groups: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
          source_output_profile_id: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
          source_output_profile_id?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          source_output_profile_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_groups_source_output_profile_id_fkey"
            columns: ["source_output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_job_rows: {
        Row: {
          created_at: string
          errors: Json
          id: string
          identifier_scin: string | null
          identifier_sku: string | null
          job_id: string
          normalized_payload: Json
          organization_id: string
          raw_payload: Json
          resolved_channel_id: string | null
          resolved_family_id: string | null
          resolved_product_id: string | null
          result: Json
          row_number: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          errors?: Json
          id?: string
          identifier_scin?: string | null
          identifier_sku?: string | null
          job_id: string
          normalized_payload?: Json
          organization_id: string
          raw_payload?: Json
          resolved_channel_id?: string | null
          resolved_family_id?: string | null
          resolved_product_id?: string | null
          result?: Json
          row_number: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          errors?: Json
          id?: string
          identifier_scin?: string | null
          identifier_sku?: string | null
          job_id?: string
          normalized_payload?: Json
          organization_id?: string
          raw_payload?: Json
          resolved_channel_id?: string | null
          resolved_family_id?: string | null
          resolved_product_id?: string | null
          result?: Json
          row_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_job_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_rows_resolved_channel_id_fkey"
            columns: ["resolved_channel_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_rows_resolved_family_id_fkey"
            columns: ["resolved_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_rows_resolved_product_id_fkey"
            columns: ["resolved_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          applied_row_count: number
          channel_id: string | null
          completed_at: string | null
          created_at: string
          error_summary: string | null
          failed_row_count: number
          family_id: string | null
          id: string
          intent: string
          job_type: string
          metadata: Json
          organization_id: string
          requested_by: string | null
          scope: Json
          source_filename: string | null
          started_at: string | null
          status: string
          summary: Json
          template_source: string
          updated_at: string
          uploaded_row_count: number
        }
        Insert: {
          applied_row_count?: number
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          failed_row_count?: number
          family_id?: string | null
          id?: string
          intent: string
          job_type?: string
          metadata?: Json
          organization_id: string
          requested_by?: string | null
          scope?: Json
          source_filename?: string | null
          started_at?: string | null
          status?: string
          summary?: Json
          template_source: string
          updated_at?: string
          uploaded_row_count?: number
        }
        Update: {
          applied_row_count?: number
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          failed_row_count?: number
          family_id?: string | null
          id?: string
          intent?: string
          job_type?: string
          metadata?: Json
          organization_id?: string
          requested_by?: string | null
          scope?: Json
          source_filename?: string | null
          started_at?: string | null
          status?: string
          summary?: Json
          template_source?: string
          updated_at?: string
          uploaded_row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_share_set_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invitation_id: string
          metadata: Json
          organization_id: string
          share_set_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invitation_id: string
          metadata?: Json
          organization_id: string
          share_set_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invitation_id?: string
          metadata?: Json
          organization_id?: string
          share_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_share_set_assignments_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitation_status_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_share_set_assignments_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_share_set_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_share_set_assignments_share_set_org_fk"
            columns: ["share_set_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "share_sets"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          declined_at: string | null
          email: string
          expires_at: string
          id: string
          invitation_type: string
          invite_permissions: Json
          invited_by: string
          organization_id: string | null
          partner_organization_id: string | null
          permission_bundle_id: string | null
          permissions: Json | null
          reminder_sent_count: number | null
          requires_onboarding: boolean
          revoked_at: string | null
          role_or_access_level: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          declined_at?: string | null
          email: string
          expires_at: string
          id?: string
          invitation_type: string
          invite_permissions?: Json
          invited_by: string
          organization_id?: string | null
          partner_organization_id?: string | null
          permission_bundle_id?: string | null
          permissions?: Json | null
          reminder_sent_count?: number | null
          requires_onboarding?: boolean
          revoked_at?: string | null
          role_or_access_level: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          declined_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invitation_type?: string
          invite_permissions?: Json
          invited_by?: string
          organization_id?: string | null
          partner_organization_id?: string | null
          permission_bundle_id?: string | null
          permissions?: Json | null
          reminder_sent_count?: number | null
          requires_onboarding?: boolean
          revoked_at?: string | null
          role_or_access_level?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_permission_bundle_id_fkey"
            columns: ["permission_bundle_id"]
            isOneToOne: false
            referencedRelation: "permission_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      locale_catalog: {
        Row: {
          code: string
          created_at: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      locale_regulatory_rules: {
        Row: {
          active: boolean
          claim_type: string
          created_at: string
          example_compliant: string[]
          example_violations: string[]
          id: string
          locale_code: string
          region_code: string
          regulatory_reference: string | null
          rule_action: string
          rule_description: string
          severity: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          claim_type: string
          created_at?: string
          example_compliant?: string[]
          example_violations?: string[]
          id?: string
          locale_code: string
          region_code: string
          regulatory_reference?: string | null
          rule_action: string
          rule_description: string
          severity?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          claim_type?: string
          created_at?: string
          example_compliant?: string[]
          example_violations?: string[]
          id?: string
          locale_code?: string
          region_code?: string
          regulatory_reference?: string | null
          rule_action?: string
          rule_description?: string
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      locales: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      market_countries: {
        Row: {
          country_code: string
          created_at: string | null
          id: string
          is_active: boolean
          market_id: string
          updated_at: string | null
        }
        Insert: {
          country_code: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          market_id: string
          updated_at?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          market_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_countries_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "market_countries_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_locales: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          locale_id: string
          market_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          locale_id: string
          market_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          locale_id?: string
          market_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_locales_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_locales_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_set_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          market_id: string
          metadata: Json
          organization_id: string
          share_set_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          market_id: string
          metadata?: Json
          organization_id: string
          share_set_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          market_id?: string
          metadata?: Json
          organization_id?: string
          share_set_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_set_assignments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_set_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_set_assignments_share_set_org_fk"
            columns: ["share_set_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "share_sets"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      markets: {
        Row: {
          code: string
          created_at: string | null
          currency_code: string | null
          default_locale_id: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          organization_id: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          currency_code?: string | null
          default_locale_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          organization_id: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          currency_code?: string | null
          default_locale_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          organization_id?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "markets_default_locale_id_fkey"
            columns: ["default_locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_families: {
        Row: {
          allow_negative: boolean
          code: string
          component_schema: Json
          created_at: string | null
          default_decimal_precision: number | null
          description: string | null
          id: string
          is_active: boolean | null
          is_composite: boolean
          metadata: Json
          name: string
          organization_id: string
          standard_unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          allow_negative?: boolean
          code: string
          component_schema?: Json
          created_at?: string | null
          default_decimal_precision?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_composite?: boolean
          metadata?: Json
          name: string
          organization_id: string
          standard_unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          allow_negative?: boolean
          code?: string
          component_schema?: Json
          created_at?: string | null
          default_decimal_precision?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_composite?: boolean
          metadata?: Json
          name?: string
          organization_id?: string
          standard_unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_measurement_families_standard_unit"
            columns: ["standard_unit_id"]
            isOneToOne: false
            referencedRelation: "measurement_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_families_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_units: {
        Row: {
          code: string
          conversion_factor: number
          created_at: string | null
          id: string
          is_active: boolean | null
          measurement_family_id: string
          name: string
          symbol: string
          updated_at: string | null
        }
        Insert: {
          code: string
          conversion_factor?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          measurement_family_id: string
          name: string
          symbol: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          conversion_factor?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          measurement_family_id?: string
          name?: string
          symbol?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "measurement_units_measurement_family_id_fkey"
            columns: ["measurement_family_id"]
            isOneToOne: false
            referencedRelation: "measurement_families"
            referencedColumns: ["id"]
          },
        ]
      }
      member_scope_permissions: {
        Row: {
          channel_id: string | null
          collection_id: string | null
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          market_id: string | null
          member_id: string
          organization_id: string
          permission_key: string
          scope_type: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          collection_id?: string | null
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          market_id?: string | null
          member_id: string
          organization_id: string
          permission_key: string
          scope_type: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          collection_id?: string | null
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          market_id?: string | null
          member_id?: string
          organization_id?: string
          permission_key?: string
          scope_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_scope_permissions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_scope_permissions_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "dam_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_scope_permissions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_scope_permissions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_scope_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_scope_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_registry"
            referencedColumns: ["permission_key"]
          },
        ]
      }
      organization_billing_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          organization_id: string
          payload: Json
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          organization_id: string
          payload?: Json
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "organization_billing_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_localization_settings: {
        Row: {
          auto_create_pending_tasks_for_new_locale: boolean
          brand_instructions: string
          created_at: string
          created_by: string | null
          deepl_glossary_id: string | null
          default_source_locale_id: string | null
          default_target_locale_ids: string[]
          metadata: Json
          organization_id: string
          preferred_tone: string
          translation_enabled: boolean
          updated_at: string
          updated_by: string | null
          write_assist_enabled: boolean
        }
        Insert: {
          auto_create_pending_tasks_for_new_locale?: boolean
          brand_instructions?: string
          created_at?: string
          created_by?: string | null
          deepl_glossary_id?: string | null
          default_source_locale_id?: string | null
          default_target_locale_ids?: string[]
          metadata?: Json
          organization_id: string
          preferred_tone?: string
          translation_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          write_assist_enabled?: boolean
        }
        Update: {
          auto_create_pending_tasks_for_new_locale?: boolean
          brand_instructions?: string
          created_at?: string
          created_by?: string | null
          deepl_glossary_id?: string | null
          default_source_locale_id?: string | null
          default_target_locale_ids?: string[]
          metadata?: Json
          organization_id?: string
          preferred_tone?: string
          translation_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          write_assist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "organization_localization_setting_default_source_locale_id_fkey"
            columns: ["default_source_locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_localization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          can_download_assets: boolean | null
          can_edit_products: boolean | null
          can_manage_team: boolean | null
          created_at: string | null
          email: string
          id: string
          invited_at: string | null
          invited_by: string
          joined_at: string | null
          kinde_user_id: string
          last_accessed_at: string | null
          organization_id: string | null
          permissions: Json | null
          role: string
          status: string
          ui_locale_override: string | null
          updated_at: string | null
        }
        Insert: {
          can_download_assets?: boolean | null
          can_edit_products?: boolean | null
          can_manage_team?: boolean | null
          created_at?: string | null
          email: string
          id?: string
          invited_at?: string | null
          invited_by: string
          joined_at?: string | null
          kinde_user_id: string
          last_accessed_at?: string | null
          organization_id?: string | null
          permissions?: Json | null
          role?: string
          status?: string
          ui_locale_override?: string | null
          updated_at?: string | null
        }
        Update: {
          can_download_assets?: boolean | null
          can_edit_products?: boolean | null
          can_manage_team?: boolean | null
          created_at?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string
          joined_at?: string | null
          kinde_user_id?: string
          last_accessed_at?: string | null
          organization_id?: string | null
          permissions?: Json | null
          role?: string
          status?: string
          ui_locale_override?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscription_addons: {
        Row: {
          addon_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          quantity: number
          starts_at: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          addon_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          quantity?: number
          starts_at?: string
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          addon_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          quantity?: number
          starts_at?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscription_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "billing_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscription_addons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscription_addons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          created_by: string | null
          current_period_end: string | null
          current_period_start: string | null
          endorsely_referrer_id: string | null
          id: string
          organization_id: string
          plan_id: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          endorsely_referrer_id?: string | null
          id?: string
          organization_id: string
          plan_id: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          endorsely_referrer_id?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_usage_daily: {
        Row: {
          active_sku_peak: number
          created_at: string
          delivery_bandwidth_gb: number
          external_partner_invite_count: number
          internal_user_count: number
          organization_id: string
          source: string
          storage_gb: number
          total_sku_count: number
          translation_chars: number
          updated_at: string
          usage_date: string
          write_chars: number
        }
        Insert: {
          active_sku_peak?: number
          created_at?: string
          delivery_bandwidth_gb?: number
          external_partner_invite_count?: number
          internal_user_count?: number
          organization_id: string
          source?: string
          storage_gb?: number
          total_sku_count?: number
          translation_chars?: number
          updated_at?: string
          usage_date: string
          write_chars?: number
        }
        Update: {
          active_sku_peak?: number
          created_at?: string
          delivery_bandwidth_gb?: number
          external_partner_invite_count?: number
          internal_user_count?: number
          organization_id?: string
          source?: string
          storage_gb?: number
          total_sku_count?: number
          translation_chars?: number
          updated_at?: string
          usage_date?: string
          write_chars?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_daily_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_usage_monthly_snapshots: {
        Row: {
          active_sku_peak: number
          created_at: string
          delivery_bandwidth_gb_total: number
          external_partner_invite_peak: number
          finalized_at: string | null
          internal_user_peak: number
          organization_id: string
          period_end: string
          period_start: string
          source: string
          storage_gb_peak: number
          total_sku_count_peak: number
          translation_chars: number
          updated_at: string
          write_chars: number
        }
        Insert: {
          active_sku_peak?: number
          created_at?: string
          delivery_bandwidth_gb_total?: number
          external_partner_invite_peak?: number
          finalized_at?: string | null
          internal_user_peak?: number
          organization_id: string
          period_end: string
          period_start: string
          source?: string
          storage_gb_peak?: number
          total_sku_count_peak?: number
          translation_chars?: number
          updated_at?: string
          write_chars?: number
        }
        Update: {
          active_sku_peak?: number
          created_at?: string
          delivery_bandwidth_gb_total?: number
          external_partner_invite_peak?: number
          finalized_at?: string | null
          internal_user_peak?: number
          organization_id?: string
          period_end?: string
          period_start?: string
          source?: string
          storage_gb_peak?: number
          total_sku_count_peak?: number
          translation_chars?: number
          updated_at?: string
          write_chars?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_monthly_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          compliance_requirements: Json | null
          created_at: string | null
          data_residency_region: string | null
          default_ui_locale: string
          description: string | null
          id: string
          industry: string | null
          kinde_org_id: string
          logo_url: string | null
          name: string
          organization_type: string
          partner_category: string | null
          security_settings: Json | null
          slug: string
          storage_limit: number | null
          storage_used: number | null
          team_size: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          compliance_requirements?: Json | null
          created_at?: string | null
          data_residency_region?: string | null
          default_ui_locale?: string
          description?: string | null
          id?: string
          industry?: string | null
          kinde_org_id: string
          logo_url?: string | null
          name: string
          organization_type?: string
          partner_category?: string | null
          security_settings?: Json | null
          slug: string
          storage_limit?: number | null
          storage_used?: number | null
          team_size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          compliance_requirements?: Json | null
          created_at?: string | null
          data_residency_region?: string | null
          default_ui_locale?: string
          description?: string | null
          id?: string
          industry?: string | null
          kinde_org_id?: string
          logo_url?: string | null
          name?: string
          organization_type?: string
          partner_category?: string | null
          security_settings?: Json | null
          slug?: string
          storage_limit?: number | null
          storage_used?: number | null
          team_size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      output_channel_profiles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          market_id: string | null
          metadata: Json
          name: string
          organization_id: string
          profile_type: string
          share_with_partners: boolean
          sort_order: number
          template_key: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          market_id?: string | null
          metadata?: Json
          name: string
          organization_id: string
          profile_type?: string
          share_with_partners?: boolean
          sort_order?: number
          template_key?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          market_id?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          profile_type?: string
          share_with_partners?: boolean
          sort_order?: number
          template_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "output_channel_profiles_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "output_channel_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      output_profile_attribute_mappings: {
        Row: {
          attribute_code: string
          attribute_label: string
          constant_value: string | null
          created_at: string
          id: string
          is_required: boolean
          max_length: number | null
          metadata: Json
          notes: string | null
          organization_id: string
          override_field_code: string | null
          profile_id: string
          resolution_rule: string
          sort_order: number
          source_field_code: string | null
          source_mode: string
          source_slot_code: string | null
          updated_at: string
        }
        Insert: {
          attribute_code: string
          attribute_label: string
          constant_value?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          max_length?: number | null
          metadata?: Json
          notes?: string | null
          organization_id: string
          override_field_code?: string | null
          profile_id: string
          resolution_rule?: string
          sort_order?: number
          source_field_code?: string | null
          source_mode?: string
          source_slot_code?: string | null
          updated_at?: string
        }
        Update: {
          attribute_code?: string
          attribute_label?: string
          constant_value?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          max_length?: number | null
          metadata?: Json
          notes?: string | null
          organization_id?: string
          override_field_code?: string | null
          profile_id?: string
          resolution_rule?: string
          sort_order?: number
          source_field_code?: string | null
          source_mode?: string
          source_slot_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "output_profile_attribute_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "output_profile_attribute_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      output_profile_field_rules: {
        Row: {
          created_at: string
          field_code: string
          id: string
          is_required: boolean
          max_length: number | null
          notes: string | null
          profile_id: string
        }
        Insert: {
          created_at?: string
          field_code: string
          id?: string
          is_required?: boolean
          max_length?: number | null
          notes?: string | null
          profile_id: string
        }
        Update: {
          created_at?: string
          field_code?: string
          id?: string
          is_required?: boolean
          max_length?: number | null
          notes?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "output_profile_field_rules_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      output_slot_definitions: {
        Row: {
          allow_multiple: boolean
          asset_kind: string
          certificate_type: string | null
          classification: string
          created_at: string
          document_type: string | null
          id: string
          is_required: boolean
          label_panel_type: string | null
          metadata: Json
          organization_id: string
          output_profile_id: string
          slot_code: string
          slot_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allow_multiple?: boolean
          asset_kind: string
          certificate_type?: string | null
          classification?: string
          created_at?: string
          document_type?: string | null
          id?: string
          is_required?: boolean
          label_panel_type?: string | null
          metadata?: Json
          organization_id: string
          output_profile_id: string
          slot_code: string
          slot_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allow_multiple?: boolean
          asset_kind?: string
          certificate_type?: string | null
          classification?: string
          created_at?: string
          document_type?: string | null
          id?: string
          is_required?: boolean
          label_panel_type?: string | null
          metadata?: Json
          organization_id?: string
          output_profile_id?: string
          slot_code?: string
          slot_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "output_slot_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "output_slot_definitions_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_contract_grants: {
        Row: {
          access_level: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          organization_id: string
          output_profile_id: string
          partner_organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          output_profile_id: string
          partner_organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          output_profile_id?: string
          partner_organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_contract_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_contract_grants_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_contract_grants_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_document_contract_assignments: {
        Row: {
          created_at: string
          id: string
          market_id: string | null
          metadata: Json
          organization_id: string
          output_profile_id: string
          partner_document_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id?: string | null
          metadata?: Json
          organization_id: string
          output_profile_id: string
          partner_document_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string | null
          metadata?: Json
          organization_id?: string
          output_profile_id?: string
          partner_document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_document_contract_assignments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_document_contract_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_document_contract_assignments_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_document_contract_assignments_partner_document_id_fkey"
            columns: ["partner_document_id"]
            isOneToOne: false
            referencedRelation: "partner_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_document_product_assignments: {
        Row: {
          created_at: string
          family_id: string | null
          id: string
          market_id: string | null
          metadata: Json
          organization_id: string
          partner_document_id: string
          product_id: string | null
        }
        Insert: {
          created_at?: string
          family_id?: string | null
          id?: string
          market_id?: string | null
          metadata?: Json
          organization_id: string
          partner_document_id: string
          product_id?: string | null
        }
        Update: {
          created_at?: string
          family_id?: string | null
          id?: string
          market_id?: string | null
          metadata?: Json
          organization_id?: string
          partner_document_id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_document_product_assignments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_document_product_assignments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_document_product_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_document_product_assignments_partner_document_id_fkey"
            columns: ["partner_document_id"]
            isOneToOne: false
            referencedRelation: "partner_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_document_product_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_documents: {
        Row: {
          approval_status: string
          asset_id: string
          asset_version_id: string | null
          classification: string
          created_at: string
          created_by: string | null
          description: string | null
          document_type: string
          expires_at: string | null
          id: string
          metadata: Json
          organization_id: string
          partner_organization_id: string
          status: string
          title: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          approval_status?: string
          asset_id: string
          asset_version_id?: string | null
          classification?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_type: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          partner_organization_id: string
          status?: string
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          approval_status?: string
          asset_id?: string
          asset_version_id?: string | null
          classification?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_type?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          partner_organization_id?: string
          status?: string
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_documents_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_documents_asset_version_id_fkey"
            columns: ["asset_version_id"]
            isOneToOne: false
            referencedRelation: "dam_asset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_documents_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_market_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          is_active: boolean
          market_id: string
          metadata: Json
          organization_id: string
          output_profile_id: string | null
          partner_organization_id: string
          updated_at: string
          valid_from: string | null
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          market_id: string
          metadata?: Json
          organization_id: string
          output_profile_id?: string | null
          partner_organization_id: string
          updated_at?: string
          valid_from?: string | null
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          market_id?: string
          metadata?: Json
          organization_id?: string
          output_profile_id?: string | null
          partner_organization_id?: string
          updated_at?: string
          valid_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_market_assignments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_market_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_market_assignments_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_market_assignments_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_message_preferences: {
        Row: {
          brand_organization_id: string | null
          channel: string
          consent_source: string
          consent_text_version: string | null
          consented_at: string | null
          created_at: string
          id: string
          metadata: Json
          partner_organization_id: string
          revoked_at: string | null
          scope_type: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_organization_id?: string | null
          channel: string
          consent_source: string
          consent_text_version?: string | null
          consented_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          partner_organization_id: string
          revoked_at?: string | null
          scope_type: string
          status: string
          updated_at?: string
        }
        Update: {
          brand_organization_id?: string | null
          channel?: string
          consent_source?: string
          consent_text_version?: string | null
          consented_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          partner_organization_id?: string
          revoked_at?: string | null
          scope_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_message_preferences_brand_organization_id_fkey"
            columns: ["brand_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_message_preferences_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_share_set_grants: {
        Row: {
          access_level: string
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          metadata: Json
          organization_id: string
          partner_organization_id: string
          share_set_id: string
          status: string
          updated_at: string
          valid_from: string | null
        }
        Insert: {
          access_level?: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          partner_organization_id: string
          share_set_id: string
          status?: string
          updated_at?: string
          valid_from?: string | null
        }
        Update: {
          access_level?: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          partner_organization_id?: string
          share_set_id?: string
          status?: string
          updated_at?: string
          valid_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_share_set_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_share_set_grants_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_share_set_grants_share_set_org_fk"
            columns: ["share_set_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "share_sets"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_update_activity: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_at: string
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          partner_organization_id: string | null
          partner_update_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_at?: string
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          partner_organization_id?: string | null
          partner_update_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          partner_organization_id?: string | null
          partner_update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_update_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_update_activity_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_update_activity_update_org_fk"
            columns: ["partner_update_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_updates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_update_kit_items: {
        Row: {
          asset_id: string | null
          channel_ids: string[]
          content_json: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          item_type: string
          locale_ids: string[]
          market_ids: string[]
          metadata: Json
          organization_id: string
          partner_update_id: string
          product_id: string | null
          sort_order: number
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          asset_id?: string | null
          channel_ids?: string[]
          content_json?: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          item_type: string
          locale_ids?: string[]
          market_ids?: string[]
          metadata?: Json
          organization_id: string
          partner_update_id: string
          product_id?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          asset_id?: string | null
          channel_ids?: string[]
          content_json?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          item_type?: string
          locale_ids?: string[]
          market_ids?: string[]
          metadata?: Json
          organization_id?: string
          partner_update_id?: string
          product_id?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_update_kit_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_update_kit_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_update_kit_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_update_kit_items_update_org_fk"
            columns: ["partner_update_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_updates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_update_recipients: {
        Row: {
          acknowledged_at: string | null
          activated_at: string | null
          created_at: string
          delivery_channels: string[]
          due_at: string | null
          first_notified_at: string | null
          id: string
          metadata: Json
          opened_at: string | null
          organization_id: string
          partner_organization_id: string
          partner_update_id: string
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          activated_at?: string | null
          created_at?: string
          delivery_channels?: string[]
          due_at?: string | null
          first_notified_at?: string | null
          id?: string
          metadata?: Json
          opened_at?: string | null
          organization_id: string
          partner_organization_id: string
          partner_update_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          activated_at?: string | null
          created_at?: string
          delivery_channels?: string[]
          due_at?: string | null
          first_notified_at?: string | null
          id?: string
          metadata?: Json
          opened_at?: string | null
          organization_id?: string
          partner_organization_id?: string
          partner_update_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_update_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_update_recipients_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_update_recipients_update_org_fk"
            columns: ["partner_update_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_updates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_update_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          organization_id: string
          partner_update_id: string
          public_enabled: boolean
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          organization_id: string
          partner_update_id: string
          public_enabled?: boolean
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          organization_id?: string
          partner_update_id?: string
          public_enabled?: boolean
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_update_shares_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_update_shares_update_org_fk"
            columns: ["partner_update_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "partner_updates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      partner_updates: {
        Row: {
          created_at: string
          created_by: string
          due_at: string | null
          event_label: string | null
          id: string
          labels: string[]
          message_json: Json
          metadata: Json
          organization_id: string
          published_at: string | null
          scheduled_for: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
          updated_by: string | null
          urgency: string
        }
        Insert: {
          created_at?: string
          created_by: string
          due_at?: string | null
          event_label?: string | null
          id?: string
          labels?: string[]
          message_json?: Json
          metadata?: Json
          organization_id: string
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          urgency?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          due_at?: string | null
          event_label?: string | null
          id?: string
          labels?: string[]
          message_json?: Json
          metadata?: Json
          organization_id?: string
          published_at?: string | null
          scheduled_for?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_updates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_bundle_rules: {
        Row: {
          created_at: string
          id: string
          level: string
          module_key: string
          permission_bundle_id: string
          scope_defaults: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          level: string
          module_key: string
          permission_bundle_id: string
          scope_defaults?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          module_key?: string
          permission_bundle_id?: string
          scope_defaults?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_bundle_rules_permission_bundle_id_fkey"
            columns: ["permission_bundle_id"]
            isOneToOne: false
            referencedRelation: "permission_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_bundles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          organization_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_bundles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_registry: {
        Row: {
          created_at: string
          description: string
          id: string
          module: string
          permission_key: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          module: string
          permission_key: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          module?: string
          permission_key?: string
        }
        Relationships: []
      }
      portal_publish_audiences: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          partner_organization_id: string
          portal_publish_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          partner_organization_id: string
          portal_publish_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          partner_organization_id?: string
          portal_publish_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_publish_audiences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_publish_audiences_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_publish_audiences_portal_publish_id_fkey"
            columns: ["portal_publish_id"]
            isOneToOne: false
            referencedRelation: "portal_publishes"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_publishes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          locale_id: string | null
          market_id: string | null
          metadata: Json
          organization_id: string
          output_profile_id: string
          publish_state: string
          published_at: string
          readiness_snapshot: Json
          scope_metadata: Json
          syndication_run_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          locale_id?: string | null
          market_id?: string | null
          metadata?: Json
          organization_id: string
          output_profile_id: string
          publish_state?: string
          published_at?: string
          readiness_snapshot?: Json
          scope_metadata?: Json
          syndication_run_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          locale_id?: string | null
          market_id?: string | null
          metadata?: Json
          organization_id?: string
          output_profile_id?: string
          publish_state?: string
          published_at?: string
          readiness_snapshot?: Json
          scope_metadata?: Json
          syndication_run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_publishes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_publishes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_publishes_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_publishes_syndication_run_id_fkey"
            columns: ["syndication_run_id"]
            isOneToOne: false
            referencedRelation: "syndication_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_asset_links: {
        Row: {
          approved_for_market_ids: string[]
          asset_id: string
          asset_type: string | null
          channel_id: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          destination_id: string | null
          document_expiry_date: string | null
          document_lot_number: string | null
          document_slot_code: string | null
          document_version: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          link_context: string
          link_type: string
          locale_id: string | null
          market_id: string | null
          match_reason: string | null
          organization_id: string
          output_profile_id: string | null
          product_field_id: string | null
          product_id: string
          sort_order: number | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          approved_for_market_ids?: string[]
          asset_id: string
          asset_type?: string | null
          channel_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          document_expiry_date?: string | null
          document_lot_number?: string | null
          document_slot_code?: string | null
          document_version?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          link_context: string
          link_type?: string
          locale_id?: string | null
          market_id?: string | null
          match_reason?: string | null
          organization_id: string
          output_profile_id?: string | null
          product_field_id?: string | null
          product_id: string
          sort_order?: number | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          approved_for_market_ids?: string[]
          asset_id?: string
          asset_type?: string | null
          channel_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          document_expiry_date?: string | null
          document_lot_number?: string | null
          document_slot_code?: string | null
          document_version?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          link_context?: string
          link_type?: string
          locale_id?: string | null
          market_id?: string | null
          match_reason?: string | null
          organization_id?: string
          output_profile_id?: string | null
          product_field_id?: string | null
          product_id?: string
          sort_order?: number | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_asset_links_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_links_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_links_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "channel_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_links_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_links_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_links_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_links_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_asset_links_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assets: {
        Row: {
          asset_id: string | null
          asset_type: string | null
          created_at: string | null
          id: string
          product_id: string | null
          sort_order: number | null
        }
        Insert: {
          asset_id?: string | null
          asset_type?: string | null
          created_at?: string | null
          id?: string
          product_id?: string | null
          sort_order?: number | null
        }
        Update: {
          asset_id?: string | null
          asset_type?: string | null
          created_at?: string | null
          id?: string
          product_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_families: {
        Row: {
          code: string | null
          created_at: string | null
          created_by: string
          description: string | null
          family_type: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string | null
          require_barcode_on_active: boolean | null
          require_sku_on_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          family_type?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string | null
          require_barcode_on_active?: boolean | null
          require_sku_on_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          family_type?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string | null
          require_barcode_on_active?: boolean | null
          require_sku_on_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_families_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_family_document_rules: {
        Row: {
          channel_id: string | null
          created_at: string | null
          destination_id: string | null
          enforcement_level: string
          id: string
          is_active: boolean
          locale_id: string | null
          market_id: string | null
          notes: string | null
          organization_id: string
          product_family_id: string
          product_field_id: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string | null
          destination_id?: string | null
          enforcement_level?: string
          id?: string
          is_active?: boolean
          locale_id?: string | null
          market_id?: string | null
          notes?: string | null
          organization_id: string
          product_family_id: string
          product_field_id: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string | null
          destination_id?: string | null
          enforcement_level?: string
          id?: string
          is_active?: boolean
          locale_id?: string | null
          market_id?: string | null
          notes?: string | null
          organization_id?: string
          product_family_id?: string
          product_field_id?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_family_document_rules_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_family_document_rules_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "channel_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_family_document_rules_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_family_document_rules_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_family_document_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_family_document_rules_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_family_document_rules_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      product_family_field_groups: {
        Row: {
          created_at: string | null
          field_group_id: string
          hidden_fields: Json | null
          id: string
          product_family_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          field_group_id: string
          hidden_fields?: Json | null
          id?: string
          product_family_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          field_group_id?: string
          hidden_fields?: Json | null
          id?: string
          product_family_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_family_field_groups_field_group_id_fkey"
            columns: ["field_group_id"]
            isOneToOne: false
            referencedRelation: "field_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_family_field_groups_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      product_family_variant_attributes: {
        Row: {
          created_at: string | null
          id: string
          is_required: boolean
          product_family_id: string
          product_field_id: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_required?: boolean
          product_family_id: string
          product_field_id: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_required?: boolean
          product_family_id?: string
          product_field_id?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_family_variant_attributes_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_family_variant_attributes_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      product_field_channels: {
        Row: {
          channel_id: string
          created_at: string | null
          id: string
          product_field_id: string
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          id?: string
          product_field_id: string
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          id?: string
          product_field_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_field_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_channels_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      product_field_group_assignments: {
        Row: {
          created_at: string | null
          field_group_id: string
          id: string
          product_field_id: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          field_group_id: string
          id?: string
          product_field_id: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          field_group_id?: string
          id?: string
          product_field_id?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_field_group_assignments_field_group_id_fkey"
            columns: ["field_group_id"]
            isOneToOne: false
            referencedRelation: "field_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_group_assignments_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      product_field_locales: {
        Row: {
          created_at: string | null
          id: string
          locale_id: string
          product_field_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          locale_id: string
          product_field_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          locale_id?: string
          product_field_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_field_locales_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_locales_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      product_field_markets: {
        Row: {
          created_at: string | null
          id: string
          market_id: string
          product_field_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          market_id: string
          product_field_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          market_id?: string
          product_field_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_field_markets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_markets_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      product_field_values: {
        Row: {
          channel: string | null
          channel_id: string | null
          created_at: string | null
          destination_id: string | null
          id: string
          inherited_from_id: string | null
          is_inherited: boolean | null
          locale: string | null
          locale_id: string | null
          market_id: string | null
          product_field_id: string
          product_id: string
          updated_at: string | null
          value_boolean: boolean | null
          value_date: string | null
          value_datetime: string | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          channel?: string | null
          channel_id?: string | null
          created_at?: string | null
          destination_id?: string | null
          id?: string
          inherited_from_id?: string | null
          is_inherited?: boolean | null
          locale?: string | null
          locale_id?: string | null
          market_id?: string | null
          product_field_id: string
          product_id: string
          updated_at?: string | null
          value_boolean?: boolean | null
          value_date?: string | null
          value_datetime?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          channel?: string | null
          channel_id?: string | null
          created_at?: string | null
          destination_id?: string | null
          id?: string
          inherited_from_id?: string | null
          is_inherited?: boolean | null
          locale?: string | null
          locale_id?: string | null
          market_id?: string | null
          product_field_id?: string
          product_id?: string
          updated_at?: string | null
          value_boolean?: boolean | null
          value_date?: string | null
          value_datetime?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_field_values_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_values_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "channel_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_values_inherited_from_id_fkey"
            columns: ["inherited_from_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_values_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_values_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_values_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_field_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_fields: {
        Row: {
          allowed_channel_ids: string[] | null
          allowed_locale_ids: string[] | null
          allowed_market_ids: string[] | null
          code: string
          created_at: string | null
          data_domain: string
          default_value: string | null
          description: string | null
          field_class: string
          field_type: string
          id: string
          is_active: boolean
          is_channelable: boolean
          is_localizable: boolean
          is_locked: boolean
          is_override_capable: boolean
          is_required: boolean
          is_translatable: boolean
          is_unique: boolean
          is_write_assist_enabled: boolean
          name: string
          options: Json | null
          organization_id: string
          scope_policy: string
          sort_order: number
          system_key: string | null
          template_id: string | null
          translation_content_type: string
          updated_at: string | null
          validation_rules: Json | null
          value_storage_strategy: string
        }
        Insert: {
          allowed_channel_ids?: string[] | null
          allowed_locale_ids?: string[] | null
          allowed_market_ids?: string[] | null
          code: string
          created_at?: string | null
          data_domain?: string
          default_value?: string | null
          description?: string | null
          field_class?: string
          field_type: string
          id?: string
          is_active?: boolean
          is_channelable?: boolean
          is_localizable?: boolean
          is_locked?: boolean
          is_override_capable?: boolean
          is_required?: boolean
          is_translatable?: boolean
          is_unique?: boolean
          is_write_assist_enabled?: boolean
          name: string
          options?: Json | null
          organization_id: string
          scope_policy?: string
          sort_order?: number
          system_key?: string | null
          template_id?: string | null
          translation_content_type?: string
          updated_at?: string | null
          validation_rules?: Json | null
          value_storage_strategy?: string
        }
        Update: {
          allowed_channel_ids?: string[] | null
          allowed_locale_ids?: string[] | null
          allowed_market_ids?: string[] | null
          code?: string
          created_at?: string | null
          data_domain?: string
          default_value?: string | null
          description?: string | null
          field_class?: string
          field_type?: string
          id?: string
          is_active?: boolean
          is_channelable?: boolean
          is_localizable?: boolean
          is_locked?: boolean
          is_override_capable?: boolean
          is_required?: boolean
          is_translatable?: boolean
          is_unique?: boolean
          is_write_assist_enabled?: boolean
          name?: string
          options?: Json | null
          organization_id?: string
          scope_policy?: string
          sort_order?: number
          system_key?: string | null
          template_id?: string | null
          translation_content_type?: string
          updated_at?: string | null
          validation_rules?: Json | null
          value_storage_strategy?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_fields_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "product_table_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_output_slot_assignments: {
        Row: {
          asset_id: string
          asset_version_id: string | null
          assignment_scope: string
          assignment_source: string
          channel_id: string | null
          created_at: string
          created_by: string | null
          destination_id: string | null
          id: string
          is_override: boolean
          locale_id: string | null
          market_id: string | null
          metadata: Json
          organization_id: string
          output_profile_id: string
          pinned_version: boolean
          product_id: string
          slot_definition_id: string
          status: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          asset_id: string
          asset_version_id?: string | null
          assignment_scope?: string
          assignment_source?: string
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          id?: string
          is_override?: boolean
          locale_id?: string | null
          market_id?: string | null
          metadata?: Json
          organization_id: string
          output_profile_id: string
          pinned_version?: boolean
          product_id: string
          slot_definition_id: string
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          asset_id?: string
          asset_version_id?: string | null
          assignment_scope?: string
          assignment_source?: string
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          id?: string
          is_override?: boolean
          locale_id?: string | null
          market_id?: string | null
          metadata?: Json
          organization_id?: string
          output_profile_id?: string
          pinned_version?: boolean
          product_id?: string
          slot_definition_id?: string
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_output_slot_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_asset_version_id_fkey"
            columns: ["asset_version_id"]
            isOneToOne: false
            referencedRelation: "dam_asset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "channel_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_slot_definition_id_fkey"
            columns: ["slot_definition_id"]
            isOneToOne: false
            referencedRelation: "output_slot_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_output_slot_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_panel_instances: {
        Row: {
          channel: string | null
          created_at: string
          data: Json
          id: string
          locale: string | null
          product_field_id: string
          product_id: string
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          data?: Json
          id?: string
          locale?: string | null
          product_field_id: string
          product_id: string
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          data?: Json
          id?: string
          locale?: string | null
          product_field_id?: string
          product_id?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_panel_instances_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_panel_instances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_panel_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "product_table_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_table_templates: {
        Row: {
          code: string
          created_at: string
          definition: Json
          description: string | null
          id: string
          is_active: boolean
          kind: string
          label: string
          locale: string | null
          metadata: Json
          organization_id: string | null
          region: string | null
          regulator: string | null
          updated_at: string
          version: string
        }
        Insert: {
          code: string
          created_at?: string
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          kind: string
          label: string
          locale?: string | null
          metadata?: Json
          organization_id?: string | null
          region?: string | null
          regulator?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          code?: string
          created_at?: string
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          label?: string
          locale?: string | null
          metadata?: Json
          organization_id?: string | null
          region?: string | null
          regulator?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_table_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          assets_count: number | null
          barcode: string | null
          brand_line: string | null
          catalog_visibility: string
          content_score: number | null
          cost_of_goods: number | null
          created_at: string | null
          created_by: string
          dimensions: Json | null
          discontinued_at: string | null
          family_id: string | null
          features: string[] | null
          has_variants: boolean | null
          id: string
          inheritance: Json | null
          is_inherited: Json | null
          keywords: string[] | null
          last_modified_by: string | null
          launch_date: string | null
          long_description: string | null
          margin_percent: number | null
          marketplace_content: Json | null
          meta_description: string | null
          meta_title: string | null
          msrp: number | null
          organization_id: string | null
          parent_id: string | null
          primary_image_url: string | null
          product_name: string
          scin: string
          short_description: string | null
          sku: string | null
          specifications: Json | null
          status: string | null
          type: string
          updated_at: string | null
          variant_attributes: Json | null
          variant_axis: Json | null
          variant_count: number | null
          weight_g: number | null
        }
        Insert: {
          assets_count?: number | null
          barcode?: string | null
          brand_line?: string | null
          catalog_visibility?: string
          content_score?: number | null
          cost_of_goods?: number | null
          created_at?: string | null
          created_by: string
          dimensions?: Json | null
          discontinued_at?: string | null
          family_id?: string | null
          features?: string[] | null
          has_variants?: boolean | null
          id?: string
          inheritance?: Json | null
          is_inherited?: Json | null
          keywords?: string[] | null
          last_modified_by?: string | null
          launch_date?: string | null
          long_description?: string | null
          margin_percent?: number | null
          marketplace_content?: Json | null
          meta_description?: string | null
          meta_title?: string | null
          msrp?: number | null
          organization_id?: string | null
          parent_id?: string | null
          primary_image_url?: string | null
          product_name: string
          scin: string
          short_description?: string | null
          sku?: string | null
          specifications?: Json | null
          status?: string | null
          type: string
          updated_at?: string | null
          variant_attributes?: Json | null
          variant_axis?: Json | null
          variant_count?: number | null
          weight_g?: number | null
        }
        Update: {
          assets_count?: number | null
          barcode?: string | null
          brand_line?: string | null
          catalog_visibility?: string
          content_score?: number | null
          cost_of_goods?: number | null
          created_at?: string | null
          created_by?: string
          dimensions?: Json | null
          discontinued_at?: string | null
          family_id?: string | null
          features?: string[] | null
          has_variants?: boolean | null
          id?: string
          inheritance?: Json | null
          is_inherited?: Json | null
          keywords?: string[] | null
          last_modified_by?: string | null
          launch_date?: string | null
          long_description?: string | null
          margin_percent?: number | null
          marketplace_content?: Json | null
          meta_description?: string | null
          meta_title?: string | null
          msrp?: number | null
          organization_id?: string | null
          parent_id?: string | null
          primary_image_url?: string | null
          product_name?: string
          scin?: string
          short_description?: string | null
          sku?: string | null
          specifications?: Json | null
          status?: string | null
          type?: string
          updated_at?: string | null
          variant_attributes?: Json | null
          variant_axis?: Json | null
          variant_count?: number | null
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permission_templates: {
        Row: {
          created_at: string
          id: string
          is_allowed: boolean
          permission_key: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_allowed?: boolean
          permission_key: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          is_allowed?: boolean
          permission_key?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permission_templates_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permission_registry"
            referencedColumns: ["permission_key"]
          },
        ]
      }
      security_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json
          organization_id: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      share_set_dynamic_rules: {
        Row: {
          created_at: string
          created_by: string | null
          exclude_folder_ids: string[]
          exclude_product_family_ids: string[]
          exclude_product_name_contains: string[]
          exclude_product_types: string[]
          exclude_tags: string[]
          id: string
          include_folder_ids: string[]
          include_product_family_ids: string[]
          include_product_name_contains: string[]
          include_product_types: string[]
          include_tags: string[]
          include_usage_group_ids: string[]
          is_active: boolean
          metadata: Json
          name: string | null
          organization_id: string
          priority: number
          share_set_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exclude_folder_ids?: string[]
          exclude_product_family_ids?: string[]
          exclude_product_name_contains?: string[]
          exclude_product_types?: string[]
          exclude_tags?: string[]
          id?: string
          include_folder_ids?: string[]
          include_product_family_ids?: string[]
          include_product_name_contains?: string[]
          include_product_types?: string[]
          include_tags?: string[]
          include_usage_group_ids?: string[]
          is_active?: boolean
          metadata?: Json
          name?: string | null
          organization_id: string
          priority?: number
          share_set_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exclude_folder_ids?: string[]
          exclude_product_family_ids?: string[]
          exclude_product_name_contains?: string[]
          exclude_product_types?: string[]
          exclude_tags?: string[]
          id?: string
          include_folder_ids?: string[]
          include_product_family_ids?: string[]
          include_product_name_contains?: string[]
          include_product_types?: string[]
          include_tags?: string[]
          include_usage_group_ids?: string[]
          is_active?: boolean
          metadata?: Json
          name?: string | null
          organization_id?: string
          priority?: number
          share_set_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_set_dynamic_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_set_dynamic_rules_share_set_org_fk"
            columns: ["share_set_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "share_sets"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      share_set_items: {
        Row: {
          channel_ids: string[]
          created_at: string
          created_by: string | null
          destination_ids: string[]
          id: string
          include_descendants: boolean
          locale_ids: string[]
          market_ids: string[]
          metadata: Json
          organization_id: string
          resource_id: string
          resource_type: string
          share_set_id: string
          updated_at: string
        }
        Insert: {
          channel_ids?: string[]
          created_at?: string
          created_by?: string | null
          destination_ids?: string[]
          id?: string
          include_descendants?: boolean
          locale_ids?: string[]
          market_ids?: string[]
          metadata?: Json
          organization_id: string
          resource_id: string
          resource_type: string
          share_set_id: string
          updated_at?: string
        }
        Update: {
          channel_ids?: string[]
          created_at?: string
          created_by?: string | null
          destination_ids?: string[]
          id?: string
          include_descendants?: boolean
          locale_ids?: string[]
          market_ids?: string[]
          metadata?: Json
          organization_id?: string
          resource_id?: string
          resource_type?: string
          share_set_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_set_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_set_items_share_set_org_fk"
            columns: ["share_set_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "share_sets"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      share_sets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json
          module_key: string
          name: string
          organization_id: string
          output_profile_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          module_key: string
          name: string
          organization_id: string
          output_profile_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          module_key?: string
          name?: string
          organization_id?: string
          output_profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_sets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_sets_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      syndication_runs: {
        Row: {
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_target: string
          id: string
          locale_id: string | null
          market_id: string | null
          organization_id: string
          output_profile_id: string
          preview_metadata: Json
          product_count: number
          readiness_summary: Json
          ready_count: number
          run_status: string
          share_set_id: string | null
          source_metadata: Json
          source_type: string
          updated_at: string
          warning_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_target?: string
          id?: string
          locale_id?: string | null
          market_id?: string | null
          organization_id: string
          output_profile_id: string
          preview_metadata?: Json
          product_count?: number
          readiness_summary?: Json
          ready_count?: number
          run_status?: string
          share_set_id?: string | null
          source_metadata?: Json
          source_type?: string
          updated_at?: string
          warning_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_target?: string
          id?: string
          locale_id?: string | null
          market_id?: string | null
          organization_id?: string
          output_profile_id?: string
          preview_metadata?: Json
          product_count?: number
          readiness_summary?: Json
          ready_count?: number
          run_status?: string
          share_set_id?: string | null
          source_metadata?: Json
          source_type?: string
          updated_at?: string
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "syndication_runs_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syndication_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syndication_runs_output_profile_id_fkey"
            columns: ["output_profile_id"]
            isOneToOne: false
            referencedRelation: "output_channel_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_glossaries: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          organization_id: string
          provider: string
          provider_glossary_id: string | null
          source_language_code: string
          target_language_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          organization_id: string
          provider?: string
          provider_glossary_id?: string | null
          source_language_code: string
          target_language_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          organization_id?: string
          provider?: string
          provider_glossary_id?: string | null
          source_language_code?: string
          target_language_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "translation_glossaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_glossary_entries: {
        Row: {
          created_at: string
          created_by: string | null
          glossary_id: string
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          source_term: string
          target_term: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          glossary_id: string
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          source_term: string
          target_term: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          glossary_id?: string
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          source_term?: string
          target_term?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "translation_glossary_entries_glossary_id_fkey"
            columns: ["glossary_id"]
            isOneToOne: false
            referencedRelation: "translation_glossaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translation_glossary_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_job_items: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          edited_value: Json | null
          error_message: string | null
          field_code: string
          final_value: Json | null
          id: string
          job_id: string
          metadata: Json
          organization_id: string
          product_field_id: string | null
          product_id: string
          provider_request_meta: Json
          provider_response_meta: Json
          reviewed_at: string | null
          reviewed_by: string | null
          source_hash: string
          source_scope: Json
          source_value: Json
          status: string
          suggested_value: Json | null
          target_scope: Json
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          edited_value?: Json | null
          error_message?: string | null
          field_code: string
          final_value?: Json | null
          id?: string
          job_id: string
          metadata?: Json
          organization_id: string
          product_field_id?: string | null
          product_id: string
          provider_request_meta?: Json
          provider_response_meta?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_hash: string
          source_scope?: Json
          source_value?: Json
          status?: string
          suggested_value?: Json | null
          target_scope?: Json
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          edited_value?: Json | null
          error_message?: string | null
          field_code?: string
          final_value?: Json | null
          id?: string
          job_id?: string
          metadata?: Json
          organization_id?: string
          product_field_id?: string | null
          product_id?: string
          provider_request_meta?: Json
          provider_response_meta?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_hash?: string
          source_scope?: Json
          source_value?: Json
          status?: string
          suggested_value?: Json | null
          target_scope?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_job_items_job_org_fk"
            columns: ["job_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "translation_jobs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "translation_job_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translation_job_items_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translation_job_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_jobs: {
        Row: {
          actual_chars: number
          completed_at: string | null
          created_at: string
          error_summary: string | null
          estimated_chars: number
          field_selection: Json
          id: string
          job_type: string
          metadata: Json
          organization_id: string
          product_ids: string[]
          provider: string
          provider_meta: Json
          requested_by: string | null
          scope: Json
          source_locale_id: string | null
          started_at: string | null
          status: string
          target_locale_ids: string[]
          updated_at: string
        }
        Insert: {
          actual_chars?: number
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          estimated_chars?: number
          field_selection?: Json
          id?: string
          job_type: string
          metadata?: Json
          organization_id: string
          product_ids?: string[]
          provider?: string
          provider_meta?: Json
          requested_by?: string | null
          scope?: Json
          source_locale_id?: string | null
          started_at?: string | null
          status?: string
          target_locale_ids?: string[]
          updated_at?: string
        }
        Update: {
          actual_chars?: number
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          estimated_chars?: number
          field_selection?: Json
          id?: string
          job_type?: string
          metadata?: Json
          organization_id?: string
          product_ids?: string[]
          provider?: string
          provider_meta?: Json
          requested_by?: string | null
          scope?: Json
          source_locale_id?: string | null
          started_at?: string | null
          status?: string
          target_locale_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translation_jobs_source_locale_id_fkey"
            columns: ["source_locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      user_context_cache: {
        Row: {
          context_data: Json
          expires_at: string | null
          kinde_user_id: string
          last_updated: string | null
        }
        Insert: {
          context_data: Json
          expires_at?: string | null
          kinde_user_id: string
          last_updated?: string | null
        }
        Update: {
          context_data?: Json
          expires_at?: string | null
          kinde_user_id?: string
          last_updated?: string | null
        }
        Relationships: []
      }
      user_workspace_notification_state: {
        Row: {
          created_at: string
          id: string
          kinde_user_id: string
          last_read_at: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kinde_user_id: string
          last_read_at?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kinde_user_id?: string
          last_read_at?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_workspace_notification_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_templates: {
        Row: {
          created_at: string | null
          family_variant_id: string
          id: string
          level_1_combinations: Json | null
          level_2_combinations: Json | null
          name_pattern: string | null
          organization_id: string
          sku_pattern: string | null
          template_name: string
        }
        Insert: {
          created_at?: string | null
          family_variant_id: string
          id?: string
          level_1_combinations?: Json | null
          level_2_combinations?: Json | null
          name_pattern?: string | null
          organization_id: string
          sku_pattern?: string | null
          template_name: string
        }
        Update: {
          created_at?: string | null
          family_variant_id?: string
          id?: string
          level_1_combinations?: Json | null
          level_2_combinations?: Json | null
          name_pattern?: string | null
          organization_id?: string
          sku_pattern?: string | null
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_templates_family_variant_id_fkey"
            columns: ["family_variant_id"]
            isOneToOne: false
            referencedRelation: "family_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      invitation_status_view: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          declined_at: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          invitation_status: string | null
          invitation_type: string | null
          invited_by: string | null
          organization_id: string | null
          partner_organization_id: string | null
          permissions: Json | null
          reminder_sent_count: number | null
          requires_onboarding: boolean | null
          revoked_at: string | null
          role_or_access_level: string | null
          token: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          declined_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invitation_status?: never
          invitation_type?: string | null
          invited_by?: string | null
          organization_id?: string | null
          partner_organization_id?: string | null
          permissions?: Json | null
          reminder_sent_count?: number | null
          requires_onboarding?: boolean | null
          revoked_at?: string | null
          role_or_access_level?: string | null
          token?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          declined_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invitation_status?: never
          invitation_type?: string | null
          invited_by?: string | null
          organization_id?: string | null
          partner_organization_id?: string | null
          permissions?: Json | null
          reminder_sent_count?: number | null
          requires_onboarding?: boolean | null
          revoked_at?: string | null
          role_or_access_level?: string | null
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_panel_instances_with_templates: {
        Row: {
          channel: string | null
          created_at: string | null
          data: Json | null
          id: string | null
          locale: string | null
          product_field_code: string | null
          product_field_id: string | null
          product_id: string | null
          sort_order: number | null
          template_code: string | null
          template_definition: Json | null
          template_description: string | null
          template_id: string | null
          template_kind: string | null
          template_label: string | null
          template_locale: string | null
          template_metadata: Json | null
          template_region: string | null
          template_regulator: string | null
          template_version: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_panel_instances_product_field_id_fkey"
            columns: ["product_field_id"]
            isOneToOne: false
            referencedRelation: "product_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_panel_instances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_panel_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "product_table_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: {
        Args: {
          invitation_token_param: string
          kinde_user_id_param: string
          user_email: string
        }
        Returns: Json
      }
      accept_team_invitation: {
        Args: {
          invitation_token_param: string
          kinde_user_id_param: string
          user_email: string
        }
        Returns: boolean
      }
      authz_has_permission: {
        Args: {
          channel_id_param?: string
          collection_id_param?: string
          market_id_param?: string
          organization_id_param: string
          permission_key_param: string
          user_id_param: string
        }
        Returns: boolean
      }
      can_user_download_assets: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      can_user_edit_products: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      can_user_manage_team: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      convert_to_parent_product: {
        Args: { product_id: string }
        Returns: undefined
      }
      create_team_invitation: {
        Args: { invite_email: string; invite_role?: string; org_id: string }
        Returns: string
      }
      generate_asset_ref_for_org: {
        Args: { target_organization_id: string }
        Returns: string
      }
      generate_variant_matrix: {
        Args: { family_variant_id_param: string }
        Returns: {
          level_1_combination: Json
          level_2_combination: Json
          suggested_name: string
          suggested_sku: string
        }[]
      }
      get_brand_partners: {
        Args: { brand_org_id: string }
        Returns: {
          access_level: string
          invited_by: string
          partner_id: string
          partner_name: string
          partner_slug: string
          relationship_created_at: string
        }[]
      }
      get_current_org_code: { Args: never; Returns: string }
      get_current_user_id: { Args: never; Returns: string }
      get_family_variant_attributes: {
        Args: { family_id_param: string }
        Returns: {
          field_code: string
          field_description: string
          field_name: string
          field_type: string
          id: string
          is_required: boolean
          options: Json
          product_field_id: string
          sort_order: number
          validation_rules: Json
        }[]
      }
      get_last_accessed_workspace: {
        Args: { user_id: string }
        Returns: {
          last_accessed: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      get_partner_brands: {
        Args: { partner_org_id: string }
        Returns: {
          access_level: string
          brand_id: string
          brand_name: string
          brand_slug: string
          relationship_created_at: string
        }[]
      }
      get_product_variant_attribute_values: {
        Args: { product_id_param: string }
        Returns: {
          field_code: string
          field_name: string
          field_type: string
          value_boolean: boolean
          value_date: string
          value_datetime: string
          value_json: Json
          value_number: number
          value_text: string
        }[]
      }
      get_user_accessible_org_ids: { Args: never; Returns: string[] }
      get_user_accessible_organizations: { Args: never; Returns: string[] }
      get_user_owned_org_ids: { Args: never; Returns: string[] }
      get_user_permissions: {
        Args: { org_id: string; user_id: string }
        Returns: Json
      }
      get_user_role_in_org: {
        Args: { org_id: string; user_id: string }
        Returns: string
      }
      get_variant_combinations: {
        Args: { parent_product_id: string }
        Returns: {
          primary_image_url: string
          product_name: string
          sku: string
          status: string
          variant_attributes: Json
          variant_id: string
        }[]
      }
      inherit_attributes_from_parent: {
        Args: { parent_product_id: string; variant_product_id: string }
        Returns: undefined
      }
      log_security_event: {
        Args: {
          action_param: string
          actor_user_id_param: string
          ip_address_param?: unknown
          metadata_param?: Json
          organization_id_param: string
          resource_id_param?: string
          resource_type_param: string
          user_agent_param?: string
        }
        Returns: string
      }
      rebuild_asset_tags_array: {
        Args: { p_asset_id: string }
        Returns: undefined
      }
      rebuild_asset_tags_array_for_tag: {
        Args: { p_tag_id: string }
        Returns: undefined
      }
      seed_measurement_families_for_organization: {
        Args: { org_id: string }
        Returns: undefined
      }
      set_rls_setting: {
        Args: { is_local?: boolean; new_value: string; setting_name: string }
        Returns: undefined
      }
      update_workspace_access: {
        Args: { user_id: string; workspace_id: string }
        Returns: undefined
      }
      user_has_org_access: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      validate_product_field_template_scope: {
        Args: { org_uuid: string; template_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      barcode_type: "UPC" | "EAN" | "GTIN" | "ISBN" | "CODE128" | "OTHER"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      barcode_type: ["UPC", "EAN", "GTIN", "ISBN", "CODE128", "OTHER"],
    },
  },
} as const
