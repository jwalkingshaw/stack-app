import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { DamAsset, DamFolder, Organization } from '@tradetool/types';

export class DatabaseQueries {
  constructor(private supabase: SupabaseClient<Database>) {}

  // Organizations
  async getOrganizationByKindeId(kindeId: string): Promise<Organization | null> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('kinde_org_id', kindeId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      type: data.type || 'brand', // Default to brand for backward compatibility
      kindeOrgId: data.kinde_org_id,
      storageUsed: data.storage_used,
      storageLimit: data.storage_limit,
      industry: data.industry,
      teamSize: data.team_size,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      type: data.type || 'brand', // Default to brand for backward compatibility
      kindeOrgId: data.kinde_org_id,
      storageUsed: data.storage_used,
      storageLimit: data.storage_limit,
      industry: data.industry,
      teamSize: data.team_size,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  // Organization membership
  async getOrganizationMembership(organizationId: string, kindeUserId: string) {
    const { data, error } = await this.supabase
      .from('organization_members')
      .select('id, role, status, created_at')
      .eq('organization_id', organizationId)
      .eq('kinde_user_id', kindeUserId)
      .eq('status', 'active')
      .single();

    if (error || !data) return null;
    return data;
  }

  async createOrganization(org: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>): Promise<Organization | null> {
    const { data, error } = await this.supabase
      .from('organizations')
      .insert({
        kinde_org_id: org.kindeOrgId,
        name: org.name,
        slug: org.slug,
        type: org.type,
        storage_used: org.storageUsed,
        storage_limit: org.storageLimit,
        industry: org.industry,
        team_size: org.teamSize,
      })
      .select()
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      type: data.type || 'brand', // Default to brand for backward compatibility
      kindeOrgId: data.kinde_org_id,
      storageUsed: data.storage_used,
      storageLimit: data.storage_limit,
      industry: data.industry,
      teamSize: data.team_size,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  // Folders
  async getFoldersByOrganization(organizationId: string): Promise<DamFolder[]> {
    const { data, error } = await this.supabase
      .from('dam_folders')
      .select('*')
      .eq('organization_id', organizationId)
      .order('path');

    if (error || !data) return [];

    return data.map(folder => ({
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
    const { data, error } = await this.supabase
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
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      parentId: data.parent_id,
      path: data.path,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
  }

  // Assets
  async getAssetsByOrganization(
    organizationId: string,
    folderId?: string,
    limit = 50,
    offset = 0
  ): Promise<DamAsset[]> {
    let query = this.supabase
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

    return data.map(asset => ({
      id: asset.id,
      organizationId: asset.organization_id,
      folderId: asset.folder_id,
      filename: asset.filename,
      originalFilename: asset.original_filename,
      fileType: asset.file_type,
      fileSize: asset.file_size,
      mimeType: asset.mime_type,
      s3Key: asset.s3_key,
      s3Url: asset.s3_url,
      thumbnailUrls: asset.thumbnail_urls,
      metadata: asset.metadata,
      tags: asset.tags,
      description: asset.description,
      createdBy: asset.created_by,
      createdAt: asset.created_at,
      updatedAt: asset.updated_at,
    }));
  }

  async createAsset(asset: Omit<DamAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<DamAsset | null> {
    const { data, error } = await this.supabase
      .from('dam_assets')
      .insert({
        organization_id: asset.organizationId,
        folder_id: asset.folderId,
        filename: asset.filename,
        original_filename: asset.originalFilename,
        file_type: asset.fileType,
        file_size: asset.fileSize,
        mime_type: asset.mimeType,
        s3_key: asset.s3Key,
        s3_url: asset.s3Url,
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
      id: data.id,
      organizationId: data.organization_id,
      folderId: data.folder_id,
      filename: data.filename,
      originalFilename: data.original_filename,
      fileType: data.file_type,
      fileSize: data.file_size,
      mimeType: data.mime_type,
      s3Key: data.s3_key,
      s3Url: data.s3_url,
      thumbnailUrls: data.thumbnail_urls,
      metadata: data.metadata,
      tags: data.tags,
      description: data.description,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async updateAsset(id: string, updates: Partial<Pick<DamAsset, 'tags' | 'description' | 'filename'>>): Promise<DamAsset | null> {
    const { data, error } = await this.supabase
      .from('dam_assets')
      .update({
        tags: updates.tags,
        description: updates.description,
        filename: updates.filename,
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      organizationId: data.organization_id,
      folderId: data.folder_id,
      filename: data.filename,
      originalFilename: data.original_filename,
      fileType: data.file_type,
      fileSize: data.file_size,
      mimeType: data.mime_type,
      s3Key: data.s3_key,
      s3Url: data.s3_url,
      thumbnailUrls: data.thumbnail_urls,
      metadata: data.metadata,
      tags: data.tags,
      description: data.description,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async deleteAsset(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('dam_assets')
      .delete()
      .eq('id', id);

    return !error;
  }

  async deleteFolder(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('dam_folders')
      .delete()
      .eq('id', id);

    return !error;
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
  }): Promise<Organization | null> {
    const { data: orgData, error } = await this.supabase
      .from('organizations')
      .insert({
        name: data.name,
        slug: data.slug,
        kinde_org_id: data.kindeOrgId,
        industry: data.industry,
        team_size: data.teamSize,
        storage_limit: 5368709120, // 5GB for all workspaces
      })
      .select()
      .single();

    if (error || !orgData) return null;

    return {
      id: orgData.id,
      name: orgData.name,
      slug: orgData.slug,
      type: orgData.type || 'workspace',
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
    const { data, error } = await this.supabase.rpc('get_sharing_workspaces', {
      workspace_id: workspaceId
    });

    if (error || !data) return [];

    return data.map((row: any) => ({
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
    const { data, error } = await this.supabase.rpc('get_receiving_workspaces', {
      workspace_id: workspaceId
    });

    if (error || !data) return [];

    return data.map((row: any) => ({
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
    const { error } = await this.supabase
      .from('workspace_relationships')
      .insert({
        sharing_workspace_id: data.sharingWorkspaceId,
        receiving_workspace_id: data.receivingWorkspaceId,
        invited_by: data.invitedBy,
        permissions: data.permissions || {},
        status: 'active'
      });

    return !error;
  }

  /**
   * Get all workspaces
   */
  async getAllWorkspaces(): Promise<Organization[]> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*');

    if (error || !data) return [];

    return data.map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type || 'workspace',
      kindeOrgId: row.kinde_org_id,
      storageUsed: row.storage_used,
      storageLimit: row.storage_limit,
      industry: row.industry,
      teamSize: row.team_size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}