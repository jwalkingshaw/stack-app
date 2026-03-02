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

  // Organizations
  async getOrganizationByKindeId(kindeId: string): Promise<Organization | null> {
    const { data, error } = await (this.supabase as any)
      .from('organizations')
      .select('*')
      .eq('kinde_org_id', kindeId)
      .single();

    if (error || !data) return null;

    return {
      id: (data as any).id,
      name: (data as any).name,
      slug: (data as any).slug,
      type: (data as any).organization_type || (data as any).type || 'brand',
      organizationType: (data as any).organization_type || 'brand',
      partnerCategory: (data as any).partner_category ?? null,
      kindeOrgId: (data as any).kinde_org_id,
      storageUsed: (data as any).storage_used,
      storageLimit: (data as any).storage_limit,
      industry: (data as any).industry,
      teamSize: (data as any).team_size,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at,
    };
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const { data, error } = await (this.supabase as any)
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;

    return {
      id: (data as any).id,
      name: (data as any).name,
      slug: (data as any).slug,
      type: (data as any).organization_type || (data as any).type || 'brand',
      organizationType: (data as any).organization_type || 'brand',
      partnerCategory: (data as any).partner_category ?? null,
      kindeOrgId: (data as any).kinde_org_id,
      storageUsed: (data as any).storage_used,
      storageLimit: (data as any).storage_limit,
      industry: (data as any).industry,
      teamSize: (data as any).team_size,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at,
    };
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

    return {
      id: (data as any).id,
      name: (data as any).name,
      slug: (data as any).slug,
      type: (data as any).organization_type || (data as any).type || 'brand',
      organizationType: (data as any).organization_type || 'brand',
      partnerCategory: (data as any).partner_category ?? null,
      kindeOrgId: (data as any).kinde_org_id,
      storageUsed: (data as any).storage_used,
      storageLimit: (data as any).storage_limit,
      industry: (data as any).industry,
      teamSize: (data as any).team_size,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at,
    };
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

    return (data as any).map((asset: any) => ({
      id: asset.id,
      organizationId: asset.organization_id,
      folderId: asset.folder_id,
      filename: asset.filename,
      originalFilename: asset.original_filename,
      fileType: asset.file_type,
      assetType: asset.asset_type,
      assetScope: asset.asset_scope,
      currentVersionNumber: asset.current_version_number,
      currentVersionComment: asset.current_version_comment,
      currentVersionEffectiveFrom: asset.current_version_effective_from,
      currentVersionEffectiveTo: asset.current_version_effective_to,
      currentVersionChangedBy: asset.current_version_changed_by,
      currentVersionChangedAt: asset.current_version_changed_at,
      fileSize: asset.file_size,
      mimeType: asset.mime_type,
      filePath: asset.file_path,
      s3Key: asset.s3_key,
      s3Url: asset.s3_url,
      thumbnailUrls: asset.thumbnail_urls,
      metadata: asset.metadata,
      tags: asset.tags,
      description: asset.description,
      productIdentifiers: asset.product_identifiers,
      createdBy: asset.created_by,
      createdAt: asset.created_at,
      updatedAt: asset.updated_at,
    }));
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
        file_size: asset.fileSize,
        mime_type: asset.mimeType,
        file_path: (asset as any).filePath ?? asset.s3Key,
        s3_key: asset.s3Key,
        s3_url: asset.s3Url,
        product_identifiers: (asset as any).productIdentifiers ?? [],
        thumbnail_urls: asset.thumbnailUrls,
        metadata: asset.metadata,
        tags: asset.tags,
        description: asset.description,
        created_by: asset.createdBy,
      })
      .select()
      .single();

    if (error || !data) return null;

    return {
      id: (data as any).id,
      organizationId: (data as any).organization_id,
      folderId: (data as any).folder_id,
      filename: (data as any).filename,
      originalFilename: (data as any).original_filename,
      fileType: (data as any).file_type,
      assetType: (data as any).asset_type,
      assetScope: (data as any).asset_scope,
      currentVersionNumber: (data as any).current_version_number,
      currentVersionComment: (data as any).current_version_comment,
      currentVersionEffectiveFrom: (data as any).current_version_effective_from,
      currentVersionEffectiveTo: (data as any).current_version_effective_to,
      currentVersionChangedBy: (data as any).current_version_changed_by,
      currentVersionChangedAt: (data as any).current_version_changed_at,
      fileSize: (data as any).file_size,
      mimeType: (data as any).mime_type,
      filePath: (data as any).file_path,
      s3Key: (data as any).s3_key,
      s3Url: (data as any).s3_url,
      thumbnailUrls: (data as any).thumbnail_urls,
      metadata: (data as any).metadata,
      tags: (data as any).tags,
      description: (data as any).description,
      productIdentifiers: (data as any).product_identifiers,
      createdBy: (data as any).created_by,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at,
    };
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
    }
  ): Promise<DamAsset | null> {
    const payload: Record<string, any> = {};

    if (updates.filename !== undefined) {
      payload.filename = updates.filename.trim();
      payload.original_filename = updates.filename.trim();
    }

    if (updates.description !== undefined) {
      payload.description = updates.description ? updates.description.trim() : null;
    }

    if (updates.folderId !== undefined) {
      payload.folder_id = updates.folderId;
    }

    if (updates.metadata !== undefined) {
      payload.metadata = updates.metadata;
    }

    if (updates.thumbnailUrls !== undefined) {
      payload.thumbnail_urls = updates.thumbnailUrls;
    }

    if (updates.tags !== undefined) {
      payload.tags = updates.tags;
    }

    if (Object.keys(payload).length === 0) {
      const asset = await this.getAssetById(id, organizationId);
      return asset;
    }

    // Ensure lightweight metadata edits still produce a new version token for clients.
    payload.updated_at = new Date().toISOString();

    const { data, error } = await (this.supabase as any)
      .from('dam_assets')
      .update(payload)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error || !data) return null;

    return {
      id: (data as any).id,
      organizationId: (data as any).organization_id,
      folderId: (data as any).folder_id,
      filename: (data as any).filename,
      originalFilename: (data as any).original_filename,
      fileType: (data as any).file_type,
      assetType: (data as any).asset_type,
      assetScope: (data as any).asset_scope,
      currentVersionNumber: (data as any).current_version_number,
      currentVersionComment: (data as any).current_version_comment,
      currentVersionEffectiveFrom: (data as any).current_version_effective_from,
      currentVersionEffectiveTo: (data as any).current_version_effective_to,
      currentVersionChangedBy: (data as any).current_version_changed_by,
      currentVersionChangedAt: (data as any).current_version_changed_at,
      fileSize: (data as any).file_size,
      mimeType: (data as any).mime_type,
      filePath: (data as any).file_path,
      s3Key: (data as any).s3_key,
      s3Url: (data as any).s3_url,
      thumbnailUrls: (data as any).thumbnail_urls,
      metadata: (data as any).metadata,
      tags: (data as any).tags,
      description: (data as any).description,
      productIdentifiers: (data as any).product_identifiers,
      createdBy: (data as any).created_by,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at,
    };
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

    return {
      id: (data as any).id,
      organizationId: (data as any).organization_id,
      folderId: (data as any).folder_id,
      filename: (data as any).filename,
      originalFilename: (data as any).original_filename,
      fileType: (data as any).file_type,
      assetType: (data as any).asset_type,
      assetScope: (data as any).asset_scope,
      currentVersionNumber: (data as any).current_version_number,
      currentVersionComment: (data as any).current_version_comment,
      currentVersionEffectiveFrom: (data as any).current_version_effective_from,
      currentVersionEffectiveTo: (data as any).current_version_effective_to,
      currentVersionChangedBy: (data as any).current_version_changed_by,
      currentVersionChangedAt: (data as any).current_version_changed_at,
      fileSize: (data as any).file_size,
      mimeType: (data as any).mime_type,
      filePath: (data as any).file_path,
      s3Key: (data as any).s3_key,
      s3Url: (data as any).s3_url,
      productIdentifiers: (data as any).product_identifiers,
      thumbnailUrls: (data as any).thumbnail_urls,
      metadata: (data as any).metadata,
      tags: (data as any).tags,
      description: (data as any).description,
      createdBy: (data as any).created_by,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at,
    };
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
        storage_limit: 5368709120, // 5GB for all workspaces
      })
      .select()
      .single();

    if (error || !orgData) return null;

    return {
      id: orgData.id,
      name: orgData.name,
      slug: orgData.slug,
      type: orgData.organization_type || 'brand',
      organizationType: orgData.organization_type || 'brand',
      partnerCategory: (orgData as any).partner_category ?? null,
      kindeOrgId: orgData.kinde_org_id,
      storageUsed: orgData.storage_used,
      storageLimit: orgData.storage_limit,
      industry: orgData.industry,
      teamSize: orgData.team_size,
      createdAt: orgData.created_at,
      updatedAt: orgData.updated_at,
    };
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

    return (data as any).map((row: any) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.organization_type || row.type || 'brand',
      organizationType: row.organization_type || 'brand',
      partnerCategory: row.partner_category ?? null,
      kindeOrgId: row.kinde_org_id,
      storageUsed: row.storage_used,
      storageLimit: row.storage_limit,
      industry: row.industry,
      teamSize: row.team_size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
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
