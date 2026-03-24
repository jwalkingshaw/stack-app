import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type {
  AssetCategory,
  AssetCategoryAssignment,
  AssetTag,
  AssetTagAssignment,
  DamAsset,
  DamFolder,
  Organization,
} from '@tradetool/types';

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

export class DatabaseQueries {
  constructor(private supabase: SupabaseClient<Database>) {}

  private readonly authzSampleRate = 0.05;
  private readonly authzWarnThresholdMs = 120;

  private async logAuthzPerformance(params: {
    organizationId: string;
    userId: string;
    permissionKey: string;
    durationMs: number;
    marketId?: string | null;
    channelId?: string | null;
    collectionId?: string | null;
    allowed: boolean;
    sampled: boolean;
    errored: boolean;
  }) {
    try {
      await (this.supabase as any).rpc("log_security_event", {
        organization_id_param: params.organizationId,
        actor_user_id_param: params.userId,
        action_param: "authz.query.duration",
        resource_type_param: "permission_check",
        resource_id_param: params.permissionKey,
        metadata_param: {
          permission_key: params.permissionKey,
          duration_ms: params.durationMs,
          market_id: params.marketId ?? null,
          channel_id: params.channelId ?? null,
          collection_id: params.collectionId ?? null,
          allowed: params.allowed,
          sampled: params.sampled,
          errored: params.errored,
        },
      });
    } catch {
      // best-effort instrumentation; do not impact authz decision flow
    }
  }

  private mapOrganizationRow(row: any): Organization {
    const metadata = asRecord(row?.metadata);
    const branding = asRecord(metadata?.branding);
    const website =
      normalizeOptionalString(row?.website) ??
      normalizeOptionalString(metadata?.website);
    const description =
      normalizeOptionalString(row?.description) ??
      normalizeOptionalString(metadata?.description);
    const logoUrl =
      normalizeOptionalString(row?.logo_url) ??
      normalizeOptionalString(row?.logoUrl) ??
      normalizeOptionalString(metadata?.logo_url) ??
      normalizeOptionalString(metadata?.logoUrl) ??
      normalizeOptionalString(branding?.logo_url) ??
      normalizeOptionalString(branding?.logoUrl);

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.organization_type || row.type || 'brand',
      organizationType: row.organization_type || 'brand',
      partnerCategory: row.partner_category ?? null,
      kindeOrgId: row.kinde_org_id,
      storageUsed: row.storage_used,
      storageLimit: row.storage_limit,
      website,
      description,
      logoUrl,
      defaultUiLocale: normalizeOptionalString(row?.default_ui_locale) ?? "en-US",
      industry: row.industry,
      teamSize: row.team_size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Organizations
  async getOrganizationByKindeId(kindeId: string): Promise<Organization | null> {
    const { data, error } = await (this.supabase as any)
      .from('organizations')
      .select('*')
      .eq('kinde_org_id', kindeId)
      .single();

    if (error || !data) return null;

    return this.mapOrganizationRow(data as any);
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const { data, error } = await (this.supabase as any)
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;

    return this.mapOrganizationRow(data as any);
  }

  // Organization membership
  async getOrganizationMembership(organizationId: string, kindeUserId: string) {
    const { data, error } = await (this.supabase as any)
      .from('organization_members')
      .select('id, role, status, created_at')
      .eq('organization_id', organizationId)
      .eq('kinde_user_id', kindeUserId)
      .eq('status', 'active')
      .single();

    if (error || !data) return null;
    return data;
  }

  // Permission-related methods
  async getOrganizationMember(userId: string, orgId: string) {
    const { data, error } = await (this.supabase as any)
      .from('organization_members')
      .select('*')
      .eq('kinde_user_id', userId)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      organizationId: data.organization_id,
      kindeUserId: data.kinde_user_id,
      email: data.email,
      role: data.role,
      canDownloadAssets: data.can_download_assets,
      canEditProducts: data.can_edit_products,
      canManageTeam: data.can_manage_team,
      permissions: data.permissions,
      uiLocaleOverride: data.ui_locale_override ?? null,
      joinedAt: data.joined_at,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getUserPermissions(userId: string, orgId: string) {
    const { data, error } = await (this.supabase as any)
      .rpc('get_user_permissions', {
        user_id: userId,
        org_id: orgId
      });

    if (error || !data) {
      return {
        role: null,
        can_download_assets: false,
        can_edit_products: false,
        can_manage_team: false,
        is_owner: false,
        is_admin: false,
        is_partner: false,
      };
    }

    return data;
  }

  async canDownloadAssets(userId: string, orgId: string): Promise<boolean> {
    const { data, error } = await (this.supabase as any)
      .rpc('can_user_download_assets', {
        user_id: userId,
        org_id: orgId
      });

    if (error) return false;
    return data === true;
  }

  async canEditProducts(userId: string, orgId: string): Promise<boolean> {
    const { data, error } = await (this.supabase as any)
      .rpc('can_user_edit_products', {
        user_id: userId,
        org_id: orgId
      });

    if (error) return false;
    return data === true;
  }

  async canManageTeam(userId: string, orgId: string): Promise<boolean> {
    const { data, error } = await (this.supabase as any)
      .rpc('can_user_manage_team', {
        user_id: userId,
        org_id: orgId
      });

    if (error) return false;
    return data === true;
  }

  async hasScopedPermission(params: {
    userId: string;
    organizationId: string;
    permissionKey: string;
    marketId?: string | null;
    channelId?: string | null;
    collectionId?: string | null;
  }): Promise<boolean> {
    const startedAt = Date.now();
    const { data, error } = await (this.supabase as any)
      .rpc('authz_has_permission', {
        user_id_param: params.userId,
        organization_id_param: params.organizationId,
        permission_key_param: params.permissionKey,
        market_id_param: params.marketId ?? null,
        channel_id_param: params.channelId ?? null,
        collection_id_param: params.collectionId ?? null,
      });

    const durationMs = Date.now() - startedAt;
    const allowed = !error && data === true;
    const shouldSample = Math.random() < this.authzSampleRate;
    const isSlow = durationMs >= this.authzWarnThresholdMs;

    if (isSlow || shouldSample) {
      await this.logAuthzPerformance({
        organizationId: params.organizationId,
        userId: params.userId,
        permissionKey: params.permissionKey,
        durationMs,
        marketId: params.marketId,
        channelId: params.channelId,
        collectionId: params.collectionId,
        allowed,
        sampled: !isSlow && shouldSample,
        errored: Boolean(error),
      });
    }

    if (isSlow) {
      console.warn("[authz] slow permission check", {
        permissionKey: params.permissionKey,
        durationMs,
        organizationId: params.organizationId,
      });
    }

    if (error) return false;
    return allowed;
  }

  async hasOrgAccess(userId: string, orgId: string): Promise<boolean> {
    const { data, error } = await (this.supabase as any)
      .rpc('user_has_org_access', {
        user_id: userId,
        org_id: orgId
      });

    if (error) return false;
    return data === true;
  }

  async getUserRole(userId: string, orgId: string): Promise<string | null> {
    const { data, error } = await (this.supabase as any)
      .rpc('get_user_role_in_org', {
        user_id: userId,
        org_id: orgId
      });

    if (error || !data) return null;
    return data;
  }

  async updateMemberRole(memberId: string, role: string): Promise<boolean> {
    // Calculate permissions based on role
    const canEditProducts = ['owner', 'admin', 'editor'].includes(role);
    const canManageTeam = ['owner', 'admin'].includes(role);
    const canDownloadAssets = true; // All roles can download by default

    const { error } = await (this.supabase as any)
      .from('organization_members')
      .update({
        role,
        can_edit_products: canEditProducts,
        can_manage_team: canManageTeam,
        can_download_assets: canDownloadAssets,
      })
      .eq('id', memberId);

    return !error;
  }

  async updateMemberPermissions(
    memberId: string,
    permissions: {
      canDownloadAssets?: boolean;
      canEditProducts?: boolean;
      canManageTeam?: boolean;
    }
  ): Promise<boolean> {
    const updates: any = {};

    if (permissions.canDownloadAssets !== undefined) {
      updates.can_download_assets = permissions.canDownloadAssets;
    }
    if (permissions.canEditProducts !== undefined) {
      updates.can_edit_products = permissions.canEditProducts;
    }
    if (permissions.canManageTeam !== undefined) {
      updates.can_manage_team = permissions.canManageTeam;
    }

    const { error } = await (this.supabase as any)
      .from('organization_members')
      .update(updates)
      .eq('id', memberId);

    return !error;
  }

  async getOrganizationMembers(orgId: string) {
    const { data, error } = await (this.supabase as any)
      .from('organization_members')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('role', { ascending: true })
      .order('joined_at', { ascending: true });

    if (error || !data) return [];

    return data.map((member: any) => ({
      id: member.id,
      organizationId: member.organization_id,
      kindeUserId: member.kinde_user_id,
      email: member.email,
      role: member.role,
      canDownloadAssets: member.can_download_assets,
      canEditProducts: member.can_edit_products,
      canManageTeam: member.can_manage_team,
      permissions: member.permissions,
      joinedAt: member.joined_at,
      status: member.status,
      invitedBy: member.invited_by,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
    }));
  }

  async removeMember(memberId: string): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('organization_members')
      .update({ status: 'left' })
      .eq('id', memberId);

    return !error;
  }

  async createOrganization(org: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>): Promise<Organization | null> {
    const normalizedOrganizationType =
      org.organizationType === 'partner' || org.type === 'partner'
        ? 'partner'
        : 'brand';
    const { data, error } = await ((this.supabase as any) as any)
      .from('organizations')
      .insert({
        kinde_org_id: org.kindeOrgId,
        name: org.name,
        slug: org.slug,
        organization_type: normalizedOrganizationType,
        partner_category: org.partnerCategory ?? null,
        storage_used: org.storageUsed,
        storage_limit: org.storageLimit,
        industry: org.industry,
        team_size: org.teamSize,
      })
      .select()
      .single();

    if (error || !data) return null;

    return this.mapOrganizationRow(data as any);
  }

  // Folders
  async getFoldersByOrganization(organizationId: string): Promise<DamFolder[]> {
    const { data, error } = await (this.supabase as any)
      .from('dam_folders')
      .select('*')
      .eq('organization_id', organizationId)
      .order('path');

    if (error || !data) return [];

    return (data as any).map((folder: any) => ({
      id: folder.id,
      organizationId: folder.organization_id,
      name: folder.name,
      parentId: folder.parent_id,
      path: folder.path,
      createdBy: folder.created_by,
      createdAt: folder.created_at,
    }));
  }

  async createFolder(folder: Omit<DamFolder, 'id' | 'createdAt'>): Promise<DamFolder | null> {
    const { data, error } = await (this.supabase as any)
      .from('dam_folders')
      .insert({
        organization_id: folder.organizationId,
        name: folder.name,
        parent_id: folder.parentId,
        path: folder.path,
        created_by: folder.createdBy,
      })
      .select()
      .single();

    if (error || !data) return null;

    return {
      id: (data as any).id,
      organizationId: (data as any).organization_id,
      name: (data as any).name,
      parentId: (data as any).parent_id,
      path: (data as any).path,
      createdBy: (data as any).created_by,
      createdAt: (data as any).created_at,
    };
  }

  // Assets
  private mapDamAsset(row: any): DamAsset {
    return {
      id: row.id,
      organizationId: row.organization_id,
      folderId: row.folder_id,
      filename: row.filename,
      originalFilename: row.original_filename,
      fileType: row.file_type,
      assetType: row.asset_type,
      assetScope: row.asset_scope,
      assetStatus: row.asset_status ?? 'active',
      currentVersionNumber: row.current_version_number,
      currentVersionComment: row.current_version_comment,
      currentVersionEffectiveFrom: row.current_version_effective_from,
      currentVersionEffectiveTo: row.current_version_effective_to,
      currentVersionChangedBy: row.current_version_changed_by,
      currentVersionChangedAt: row.current_version_changed_at,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      filePath: row.file_path,
      s3Key: row.s3_key,
      s3Url: row.s3_url,
      thumbnailUrls: row.thumbnail_urls,
      width: row.width ?? null,
      height: row.height ?? null,
      metadata: row.metadata,
      tags: row.tags ?? [],
      description: row.description,
      productIdentifiers: row.product_identifiers,
      // Compliance & approval
      complianceStatus: row.compliance_status ?? null,
      brandLegalApproval: row.brand_legal_approval ?? null,
      // Rights & talent
      talentPresent: row.talent_present ?? null,
      releaseOnFile: row.release_on_file ?? null,
      usageEnd: row.usage_end ?? null,
      usageTerritory: row.usage_territory ?? null,
      licenseOwnership: row.license_ownership ?? null,
      usagePlatforms: row.usage_platforms ?? [],
      ftcDisclosureRequired: row.ftc_disclosure_required ?? null,
      athleteNames: row.athlete_names ?? [],
      talentContractEnd: row.talent_contract_end ?? null,
      endorsementType: row.endorsement_type ?? null,
      expirationDate: row.expiration_date ?? null,
      // Regulatory & certifications
      regulatoryRegion: row.regulatory_region ?? [],
      certifications: row.certifications ?? [],
      visibleClaims: row.visible_claims ?? [],
      claimsApprovedMarkets: row.claims_approved_markets ?? [],
      wadaRiskLevel: row.wada_risk_level ?? 'none',
      // Accessibility
      altText: row.alt_text ?? null,
      // Label / artwork
      artworkType: row.artwork_type ?? null,
      colorProfile: row.color_profile ?? null,
      printVsDigital: row.print_vs_digital ?? 'digital',
      resolutionDpi: row.resolution_dpi ?? null,
      labelVersion: row.label_version ?? null,
      formulaVersion: row.formula_version ?? null,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getAssetsByOrganization(
    organizationId: string,
    folderId?: string,
    limit = 50,
    offset = 0
  ): Promise<DamAsset[]> {
    let query = (this.supabase as any)
      .from('dam_assets')
      .select('*')
      .eq('organization_id', organizationId);

    if (folderId) {
      query = query.eq('folder_id', folderId);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error || !data) return [];
    return (data as any).map((row: any) => this.mapDamAsset(row));
  }

  async createAsset(asset: Omit<DamAsset, 'id' | 'createdAt' | 'updatedAt'> & {
    assetType?: string;
    assetScope?: string;
    productIdentifiers?: string[];
    filePath?: string | null;
  }): Promise<DamAsset | null> {
    const { data, error } = await (this.supabase as any)
      .from('dam_assets')
      .insert({
        organization_id: asset.organizationId,
        folder_id: asset.folderId,
        filename: asset.filename,
        original_filename: asset.originalFilename,
        file_type: asset.fileType,
        asset_type: (asset as any).assetType ?? asset.fileType,
        asset_scope: (asset as any).assetScope ?? 'internal',
        asset_status: asset.assetStatus ?? 'active',
        file_size: asset.fileSize,
        mime_type: asset.mimeType,
        file_path: (asset as any).filePath ?? asset.s3Key,
        s3_key: asset.s3Key,
        s3_url: asset.s3Url,
        width: asset.width ?? null,
        height: asset.height ?? null,
        product_identifiers: (asset as any).productIdentifiers ?? [],
        thumbnail_urls: asset.thumbnailUrls,
        metadata: asset.metadata,
        tags: asset.tags,
        description: asset.description,
        // Compliance & approval
        compliance_status: asset.complianceStatus ?? null,
        brand_legal_approval: asset.brandLegalApproval ?? null,
        // Rights & talent
        talent_present: asset.talentPresent ?? null,
        release_on_file: asset.releaseOnFile ?? null,
        usage_end: asset.usageEnd ?? null,
        usage_territory: asset.usageTerritory ?? null,
        license_ownership: asset.licenseOwnership ?? null,
        usage_platforms: asset.usagePlatforms ?? [],
        ftc_disclosure_required: asset.ftcDisclosureRequired ?? null,
        athlete_names: asset.athleteNames ?? [],
        talent_contract_end: asset.talentContractEnd ?? null,
        endorsement_type: asset.endorsementType ?? null,
        expiration_date: asset.expirationDate ?? null,
        // Regulatory & certifications
        regulatory_region: asset.regulatoryRegion ?? [],
        certifications: asset.certifications ?? [],
        visible_claims: asset.visibleClaims ?? [],
        claims_approved_markets: asset.claimsApprovedMarkets ?? [],
        wada_risk_level: asset.wadaRiskLevel ?? 'none',
        // Accessibility
        alt_text: asset.altText ?? null,
        // Label / artwork
        artwork_type: asset.artworkType ?? null,
        color_profile: asset.colorProfile ?? null,
        print_vs_digital: asset.printVsDigital ?? 'digital',
        resolution_dpi: asset.resolutionDpi ?? null,
        label_version: asset.labelVersion ?? null,
        formula_version: asset.formulaVersion ?? null,
        created_by: asset.createdBy,
      })
      .select()
      .single();

    if (error || !data) return null;
    return this.mapDamAsset(data as any);
  }

  async updateAssetMetadata(
    id: string,
    organizationId: string,
    updates: {
      filename?: string;
      description?: string | null;
      folderId?: string | null;
      metadata?: Record<string, any> | null;
      thumbnailUrls?: Record<string, any> | null;
      tags?: string[];
      assetStatus?: string;
      // Compliance & approval
      complianceStatus?: string | null;
      brandLegalApproval?: string | null;
      // Rights & talent
      talentPresent?: boolean | null;
      releaseOnFile?: boolean | null;
      usageEnd?: string | null;
      usageTerritory?: string | null;
      licenseOwnership?: string | null;
      usagePlatforms?: string[];
      ftcDisclosureRequired?: boolean | null;
      athleteNames?: string[];
      talentContractEnd?: string | null;
      endorsementType?: string | null;
      expirationDate?: string | null;
      // Regulatory
      regulatoryRegion?: string[];
      certifications?: string[];
      visibleClaims?: string[];
      claimsApprovedMarkets?: string[];
      wadaRiskLevel?: string;
      // Accessibility
      altText?: string | null;
      // Label / artwork
      artworkType?: string | null;
      colorProfile?: string | null;
      printVsDigital?: string;
      resolutionDpi?: number | null;
      labelVersion?: string | null;
      formulaVersion?: string | null;
      width?: number | null;
      height?: number | null;
    }
  ): Promise<DamAsset | null> {
    const payload: Record<string, any> = {};

    if (updates.filename !== undefined) {
      payload.filename = updates.filename.trim();
      payload.original_filename = updates.filename.trim();
    }
    if (updates.description !== undefined) payload.description = updates.description ? updates.description.trim() : null;
    if (updates.folderId !== undefined) payload.folder_id = updates.folderId;
    if (updates.metadata !== undefined) payload.metadata = updates.metadata;
    if (updates.thumbnailUrls !== undefined) payload.thumbnail_urls = updates.thumbnailUrls;
    if (updates.tags !== undefined) payload.tags = updates.tags;
    if (updates.assetStatus !== undefined) payload.asset_status = updates.assetStatus;
    if (updates.complianceStatus !== undefined) payload.compliance_status = updates.complianceStatus;
    if (updates.brandLegalApproval !== undefined) payload.brand_legal_approval = updates.brandLegalApproval;
    if (updates.talentPresent !== undefined) payload.talent_present = updates.talentPresent;
    if (updates.releaseOnFile !== undefined) payload.release_on_file = updates.releaseOnFile;
    if (updates.usageEnd !== undefined) payload.usage_end = updates.usageEnd;
    if (updates.usageTerritory !== undefined) payload.usage_territory = updates.usageTerritory;
    if (updates.licenseOwnership !== undefined) payload.license_ownership = updates.licenseOwnership;
    if (updates.usagePlatforms !== undefined) payload.usage_platforms = updates.usagePlatforms;
    if (updates.ftcDisclosureRequired !== undefined) payload.ftc_disclosure_required = updates.ftcDisclosureRequired;
    if (updates.athleteNames !== undefined) payload.athlete_names = updates.athleteNames;
    if (updates.talentContractEnd !== undefined) payload.talent_contract_end = updates.talentContractEnd;
    if (updates.endorsementType !== undefined) payload.endorsement_type = updates.endorsementType;
    if (updates.expirationDate !== undefined) payload.expiration_date = updates.expirationDate;
    if (updates.regulatoryRegion !== undefined) payload.regulatory_region = updates.regulatoryRegion;
    if (updates.certifications !== undefined) payload.certifications = updates.certifications;
    if (updates.visibleClaims !== undefined) payload.visible_claims = updates.visibleClaims;
    if (updates.claimsApprovedMarkets !== undefined) payload.claims_approved_markets = updates.claimsApprovedMarkets;
    if (updates.wadaRiskLevel !== undefined) payload.wada_risk_level = updates.wadaRiskLevel;
    if (updates.altText !== undefined) payload.alt_text = updates.altText;
    if (updates.artworkType !== undefined) payload.artwork_type = updates.artworkType;
    if (updates.colorProfile !== undefined) payload.color_profile = updates.colorProfile;
    if (updates.printVsDigital !== undefined) payload.print_vs_digital = updates.printVsDigital;
    if (updates.resolutionDpi !== undefined) payload.resolution_dpi = updates.resolutionDpi;
    if (updates.labelVersion !== undefined) payload.label_version = updates.labelVersion;
    if (updates.formulaVersion !== undefined) payload.formula_version = updates.formulaVersion;
    if (updates.width !== undefined) payload.width = updates.width;
    if (updates.height !== undefined) payload.height = updates.height;

    if (Object.keys(payload).length === 0) {
      return this.getAssetById(id, organizationId);
    }

    payload.updated_at = new Date().toISOString();

    const { data, error } = await (this.supabase as any)
      .from('dam_assets')
      .update(payload)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error || !data) return null;
    return this.mapDamAsset(data as any);
  }

  async deleteAsset(id: string, organizationId: string): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('dam_assets')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    return !error;
  }

  async deleteFolder(id: string): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('dam_folders')
      .delete()
      .eq('id', id);

    return !error;
  }

  async getAssetById(id: string, organizationId: string): Promise<DamAsset | null> {
    const { data, error } = await (this.supabase as any)
      .from('dam_assets')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) return null;
    return this.mapDamAsset(data as any);
  }

  // Asset tag taxonomy -------------------------------------------------------

  async getAssetTags(organizationId: string): Promise<AssetTag[]> {
    const { data, error } = await (this.supabase as any)
      .from('asset_tags')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');

    if (error || !data) return [];
    return (data as any).map((row: any) => this.mapAssetTag(row));
  }

  async getAssetTagById(tagId: string, organizationId: string): Promise<AssetTag | null> {
    const { data, error } = await (this.supabase as any)
      .from('asset_tags')
      .select('*')
      .eq('id', tagId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) return null;
    return this.mapAssetTag(data);
  }

  async createAssetTag(input: {
    organizationId: string;
    name: string;
    slug: string;
    description?: string | null;
    color?: string | null;
    createdBy?: string | null;
  }): Promise<AssetTag | null> {
    const { data, error } = await (this.supabase as any)
      .from('asset_tags')
      .insert({
        organization_id: input.organizationId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        color: input.color ?? null,
        created_by: input.createdBy ?? null,
      })
      .select()
      .single();

    if (error || !data) return null;
    return this.mapAssetTag(data);
  }

  async updateAssetTag(
    tagId: string,
    organizationId: string,
    updates: Partial<Pick<AssetTag, 'name' | 'slug' | 'description' | 'color'>>
  ): Promise<AssetTag | null> {
    const { data, error } = await (this.supabase as any)
      .from('asset_tags')
      .update({
        name: updates.name,
        slug: updates.slug,
        description: updates.description ?? null,
        color: updates.color ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tagId)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error || !data) return null;
    return this.mapAssetTag(data);
  }

  async deleteAssetTag(tagId: string, organizationId: string): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('asset_tags')
      .delete()
      .eq('id', tagId)
      .eq('organization_id', organizationId);

    return !error;
  }

  async getAssetTagAssignments(assetId: string): Promise<AssetTagAssignment[]> {
    const { data, error } = await (this.supabase as any)
      .from('asset_tag_assignments')
      .select('id, asset_id, tag_id, assigned_by, assigned_at, asset_tags(*)')
      .eq('asset_id', assetId)
      .order('assigned_at', { ascending: false });

    if (error || !data) return [];
    return (data as any).map((row: any) => this.mapAssetTagAssignment(row));
  }

  async replaceAssetTags(
    assetId: string,
    tagIds: string[],
    assignedBy: string
  ): Promise<AssetTagAssignment[]> {
    await (this.supabase as any)
      .from('asset_tag_assignments')
      .delete()
      .eq('asset_id', assetId);

    const uniqueTagIds = Array.from(new Set(tagIds));
    if (uniqueTagIds.length === 0) {
      return [];
    }

    const insertRows = uniqueTagIds.map((tagId) => ({
      asset_id: assetId,
      tag_id: tagId,
      assigned_by: assignedBy,
    }));

    const { data, error } = await (this.supabase as any)
      .from('asset_tag_assignments')
      .insert(insertRows)
      .select('id, asset_id, tag_id, assigned_by, assigned_at, asset_tags(*)');

    if (error || !data) return [];
    return (data as any).map((row: any) => this.mapAssetTagAssignment(row));
  }

  // Asset category taxonomy --------------------------------------------------

  async getAssetCategories(organizationId: string): Promise<AssetCategory[]> {
    const { data, error } = await (this.supabase as any)
      .from('asset_categories')
      .select('*')
      .eq('organization_id', organizationId)
      .order('path');

    if (error || !data) return [];
    return (data as any).map((row: any) => this.mapAssetCategory(row));
  }

  async getAssetCategoryById(
    categoryId: string,
    organizationId: string
  ): Promise<AssetCategory | null> {
    const { data, error } = await (this.supabase as any)
      .from('asset_categories')
      .select('*')
      .eq('id', categoryId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) return null;
    return this.mapAssetCategory(data);
  }

  async createAssetCategory(input: {
    organizationId: string;
    name: string;
    slug: string;
    path: string;
    parentId?: string | null;
    description?: string | null;
    createdBy?: string | null;
  }): Promise<AssetCategory | null> {
    const { data, error } = await (this.supabase as any)
      .from('asset_categories')
      .insert({
        organization_id: input.organizationId,
        name: input.name,
        slug: input.slug,
        path: input.path,
        parent_id: input.parentId ?? null,
        description: input.description ?? null,
        created_by: input.createdBy ?? null,
      })
      .select()
      .single();

    if (error || !data) return null;
    return this.mapAssetCategory(data);
  }

  async updateAssetCategory(
    categoryId: string,
    organizationId: string,
    updates: Partial<Pick<AssetCategory, 'name' | 'slug' | 'path' | 'description'>>
  ): Promise<AssetCategory | null> {
    const { data, error } = await (this.supabase as any)
      .from('asset_categories')
      .update({
        name: updates.name,
        slug: updates.slug,
        path: updates.path,
        description: updates.description ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error || !data) return null;
    return this.mapAssetCategory(data);
  }

  async deleteAssetCategory(categoryId: string, organizationId: string): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('asset_categories')
      .delete()
      .eq('id', categoryId)
      .eq('organization_id', organizationId);

    return !error;
  }

  async updateCategoryDescendantPaths(
    categoryId: string,
    oldPath: string,
    newPath: string
  ): Promise<void> {
    if (oldPath === newPath) return;

    const { data, error } = await (this.supabase as any)
      .from('asset_categories')
      .select('id, path')
      .like('path', `${oldPath}/%`);

    if (error || !data) return;

    const descendants = data as Array<{ id: string; path: string }>;
    for (const descendant of descendants) {
      const updatedPath = descendant.path.replace(oldPath, newPath);
      await (this.supabase as any)
        .from('asset_categories')
        .update({
          path: updatedPath,
          updated_at: new Date().toISOString(),
        })
        .eq('id', descendant.id);
    }
  }

  async getAssetCategoryAssignments(assetId: string): Promise<AssetCategoryAssignment[]> {
    const { data, error } = await (this.supabase as any)
      .from('asset_category_assignments')
      .select('id, asset_id, category_id, is_primary, assigned_by, assigned_at, asset_categories(*)')
      .eq('asset_id', assetId)
      .order('is_primary', { ascending: false })
      .order('assigned_at', { ascending: false });

    if (error || !data) return [];
    return (data as any).map((row: any) => this.mapAssetCategoryAssignment(row));
  }

  async replaceAssetCategories(
    assetId: string,
    categoryIds: string[],
    assignedBy: string,
    primaryCategoryId?: string | null
  ): Promise<AssetCategoryAssignment[]> {
    await (this.supabase as any)
      .from('asset_category_assignments')
      .delete()
      .eq('asset_id', assetId);

    let uniqueCategoryIds = Array.from(new Set(categoryIds));
    if (primaryCategoryId && !uniqueCategoryIds.includes(primaryCategoryId)) {
      uniqueCategoryIds = [...uniqueCategoryIds, primaryCategoryId];
    }

    if (uniqueCategoryIds.length === 0) {
      return [];
    }

    const insertRows = uniqueCategoryIds.map((categoryId) => ({
      asset_id: assetId,
      category_id: categoryId,
      is_primary: primaryCategoryId === categoryId,
      assigned_by: assignedBy,
    }));

    const { data, error } = await (this.supabase as any)
      .from('asset_category_assignments')
      .insert(insertRows)
      .select('id, asset_id, category_id, is_primary, assigned_by, assigned_at, asset_categories(*)');

    if (error || !data) return [];

    if (primaryCategoryId) {
      await (this.supabase as any)
        .from('asset_category_assignments')
        .update({ is_primary: false })
        .eq('asset_id', assetId)
        .neq('category_id', primaryCategoryId);
    }

    return (data as any).map((row: any) => this.mapAssetCategoryAssignment(row));
  }

  async setPrimaryCategory(
    assetId: string,
    categoryId: string,
    assignedBy: string
  ): Promise<AssetCategoryAssignment[] | null> {
    const { error } = await (this.supabase as any)
      .from('asset_category_assignments')
      .update({ is_primary: false })
      .eq('asset_id', assetId);

    if (error) return null;

    const { data, error: promoteError } = await (this.supabase as any)
      .from('asset_category_assignments')
      .upsert({
        asset_id: assetId,
        category_id: categoryId,
        is_primary: true,
        assigned_by: assignedBy,
      })
      .select('id, asset_id, category_id, is_primary, assigned_by, assigned_at, asset_categories(*)');

    if (promoteError || !data) return null;
    return (data as any).map((row: any) => this.mapAssetCategoryAssignment(row));
  }

  // Products -----------------------------------------------------------------

  async updateProductStatus(
    organizationId: string,
    productId: string,
    status: 'Draft' | 'Enrichment' | 'Review' | 'Active' | 'Discontinued' | 'Archived',
    userId: string
  ): Promise<any> {
    const { data, error } = await (this.supabase as any)
      .from('products')
      .update({
        status,
        last_modified_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .eq('organization_id', organizationId)
      .select('*')
      .single();

    if (error || !data) return null;
    return data;
  }

  // Workspace Methods

  /**
   * Create a new workspace
   */
  async createWorkspace(data: {
    name: string;
    slug: string;
    kindeOrgId: string;
    industry?: string;
    teamSize?: string;
    organizationType?: 'brand' | 'partner';
    partnerCategory?: 'retailer' | 'distributor' | 'wholesaler' | null;
    defaultUiLocale?: string;
  }): Promise<Organization | null> {
    const { data: orgData, error } = await (this.supabase as any)
      .from('organizations')
      .insert({
        name: (data as any).name,
        slug: (data as any).slug,
        kinde_org_id: (data as any).kindeOrgId,
        organization_type: (data as any).organizationType || 'brand',
        partner_category: (data as any).partnerCategory ?? null,
        industry: (data as any).industry,
        team_size: (data as any).teamSize,
        default_ui_locale: (data as any).defaultUiLocale || "en-US",
        storage_limit: 5368709120, // 5GB for all workspaces
      })
      .select()
      .single();

    if (error || !orgData) return null;

    return this.mapOrganizationRow(orgData as any);
  }

  /**
   * Get all workspaces sharing content with this workspace
   */
  async getSharingWorkspaces(workspaceId: string): Promise<Array<Organization & { relationshipStatus: string; permissions: any }>> {
    const { data, error } = await (this.supabase as any).rpc('get_sharing_workspaces', {
      workspace_id: workspaceId
    });

    if (error || !data) return [];

    return (data as any).map((row: any) => ({
      id: row.sharing_workspace_id,
      name: row.workspace_name,
      slug: row.workspace_slug,
      type: 'workspace' as const,
      kindeOrgId: null,
      storageUsed: 0,
      storageLimit: 0,
      industry: null,
      teamSize: null,
      createdAt: '',
      updatedAt: '',
      relationshipStatus: row.relationship_status,
      permissions: row.permissions,
    }));
  }

  /**
   * Get all workspaces receiving content from this workspace
   */
  async getReceivingWorkspaces(workspaceId: string): Promise<Array<Organization & { relationshipStatus: string; permissions: any }>> {
    const { data, error } = await (this.supabase as any).rpc('get_receiving_workspaces', {
      workspace_id: workspaceId
    });

    if (error || !data) return [];

    return (data as any).map((row: any) => ({
      id: row.receiving_workspace_id,
      name: row.workspace_name,
      slug: row.workspace_slug,
      type: 'workspace' as const,
      kindeOrgId: null,
      storageUsed: 0,
      storageLimit: 0,
      industry: null,
      teamSize: null,
      createdAt: '',
      updatedAt: '',
      relationshipStatus: row.relationship_status,
      permissions: row.permissions,
    }));
  }

  /**
   * Create a workspace relationship
   */
  async createWorkspaceRelationship(data: {
    sharingWorkspaceId: string;
    receivingWorkspaceId: string;
    invitedBy: string;
    permissions?: any;
  }): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('workspace_relationships')
      .insert({
        sharing_workspace_id: (data as any).sharingWorkspaceId,
        receiving_workspace_id: (data as any).receivingWorkspaceId,
        invited_by: (data as any).invitedBy,
        permissions: (data as any).permissions || {},
        status: 'active'
      });

    return !error;
  }

  /**
   * Get all workspaces
   */
  async getAllWorkspaces(): Promise<Organization[]> {
    const { data, error } = await (this.supabase as any)
      .from('organizations')
      .select('*');

    if (error || !data) return [];

    return (data as any).map((row: any) => this.mapOrganizationRow(row));
  }

  // Partner Relationship Methods

  /**
   * Get all brands that a partner organization has access to
   */
  async getPartnerBrands(partnerOrgId: string) {
    const { data, error } = await (this.supabase as any)
      .rpc('get_partner_brands', {
        partner_org_id: partnerOrgId
      });

    if (error || !data) return [];

    return (data as any).map((row: any) => ({
      brandId: row.brand_id,
      brandName: row.brand_name,
      brandSlug: row.brand_slug,
      accessLevel: row.access_level,
      relationshipCreatedAt: row.relationship_created_at,
    }));
  }

  /**
   * Get all partners that have access to a brand organization
   */
  async getBrandPartners(brandOrgId: string) {
    const { data, error } = await (this.supabase as any)
      .rpc('get_brand_partners', {
        brand_org_id: brandOrgId
      });

    if (error || !data) return [];

    return (data as any).map((row: any) => ({
      partnerId: row.partner_id,
      partnerName: row.partner_name,
      partnerSlug: row.partner_slug,
      accessLevel: row.access_level,
      relationshipCreatedAt: row.relationship_created_at,
      invitedBy: row.invited_by,
    }));
  }

  /**
   * Create a brand-partner relationship
   */
  async createBrandPartnerRelationship(data: {
    brandOrganizationId: string;
    partnerOrganizationId: string;
    accessLevel: 'view' | 'edit';
    invitedBy: string;
  }): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('brand_partner_relationships')
      .insert({
        brand_organization_id: data.brandOrganizationId,
        partner_organization_id: data.partnerOrganizationId,
        access_level: data.accessLevel,
        invited_by: data.invitedBy,
        status: 'active',
      });

    return !error;
  }

  /**
   * Update partner access level
   */
  async updatePartnerAccessLevel(
    brandOrgId: string,
    partnerOrgId: string,
    accessLevel: 'view' | 'edit'
  ): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('brand_partner_relationships')
      .update({
        access_level: accessLevel,
        status_updated_at: new Date().toISOString()
      })
      .eq('brand_organization_id', brandOrgId)
      .eq('partner_organization_id', partnerOrgId)
      .eq('status', 'active');

    return !error;
  }

  /**
   * Revoke partner access
   */
  async revokePartnerAccess(
    brandOrgId: string,
    partnerOrgId: string
  ): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('brand_partner_relationships')
      .update({
        status: 'revoked',
        status_updated_at: new Date().toISOString()
      })
      .eq('brand_organization_id', brandOrgId)
      .eq('partner_organization_id', partnerOrgId)
      .eq('status', 'active');

    return !error;
  }

  /**
   * Suspend partner access
   */
  async suspendPartnerAccess(
    brandOrgId: string,
    partnerOrgId: string
  ): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('brand_partner_relationships')
      .update({
        status: 'suspended',
        status_updated_at: new Date().toISOString()
      })
      .eq('brand_organization_id', brandOrgId)
      .eq('partner_organization_id', partnerOrgId)
      .eq('status', 'active');

    return !error;
  }

  /**
   * Restore suspended partner access
   */
  async restorePartnerAccess(
    brandOrgId: string,
    partnerOrgId: string
  ): Promise<boolean> {
    const { error } = await (this.supabase as any)
      .from('brand_partner_relationships')
      .update({
        status: 'active',
        status_updated_at: new Date().toISOString()
      })
      .eq('brand_organization_id', brandOrgId)
      .eq('partner_organization_id', partnerOrgId)
      .eq('status', 'suspended');

    return !error;
  }

  /**
   * Check if a partner has access to a brand
   */
  async hasPartnerAccess(
    brandOrgId: string,
    partnerOrgId: string
  ): Promise<boolean> {
    const { data, error } = await (this.supabase as any)
      .from('brand_partner_relationships')
      .select('id')
      .eq('brand_organization_id', brandOrgId)
      .eq('partner_organization_id', partnerOrgId)
      .eq('status', 'active')
      .single();

    return !error && data !== null;
  }

  /**
   * Get partner relationship details
   */
  async getPartnerRelationship(brandOrgId: string, partnerOrgId: string) {
    const { data, error } = await (this.supabase as any)
      .from('brand_partner_relationships')
      .select('*')
      .eq('brand_organization_id', brandOrgId)
      .eq('partner_organization_id', partnerOrgId)
      .eq('status', 'active')
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      brandOrganizationId: data.brand_organization_id,
      partnerOrganizationId: data.partner_organization_id,
      accessLevel: data.access_level,
      invitedBy: data.invited_by,
      createdAt: data.created_at,
      status: data.status,
      statusUpdatedAt: data.status_updated_at,
      settings: data.settings,
    };
  }

  /**
   * Check if user's organization is a partner and get accessible brands
   */
  async getUserPartnerBrands(userId: string) {
    // First, get user's partner organization
    const { data: memberData, error: memberError } = await (this.supabase as any)
      .from('organization_members')
      .select('organization_id, organizations!inner(id, organization_type)')
      .eq('kinde_user_id', userId)
      .eq('status', 'active')
      .eq('organizations.organization_type', 'partner')
      .single();

    if (memberError || !memberData) return [];

    const partnerOrgId = memberData.organization_id;

    // Get all brands this partner has access to
    return this.getPartnerBrands(partnerOrgId);
  }

  private mapAssetTag(row: any): AssetTag {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      color: row.color,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAssetCategory(row: any): AssetCategory {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      slug: row.slug,
      parentId: row.parent_id,
      path: row.path,
      description: row.description,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAssetTagAssignment(row: any): AssetTagAssignment {
    return {
      id: row.id,
      assetId: row.asset_id,
      tagId: row.tag_id,
      assignedBy: row.assigned_by,
      assignedAt: row.assigned_at,
      tag: row.asset_tags ? this.mapAssetTag(row.asset_tags) : undefined,
    };
  }

  private mapAssetCategoryAssignment(row: any): AssetCategoryAssignment {
    return {
      id: row.id,
      assetId: row.asset_id,
      categoryId: row.category_id,
      isPrimary: !!row.is_primary,
      assignedBy: row.assigned_by,
      assignedAt: row.assigned_at,
      category: row.asset_categories ? this.mapAssetCategory(row.asset_categories) : undefined,
    };
  }
}
