// Auth types
export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  organizationType?: 'brand' | 'partner';
  partnerCategory?: 'retailer' | 'distributor' | 'wholesaler' | null;
  kindeOrgId: string;
  storageUsed: number;
  storageLimit: number;
  industry?: string;
  teamSize?: string;
  createdAt: string;
  updatedAt: string;
}

// Workspace relationship types
export interface WorkspaceRelationship {
  id: string;
  sharingWorkspaceId: string;
  receivingWorkspaceId: string;
  status: 'pending' | 'active' | 'inactive';
  permissions: WorkspacePermissions;
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspacePermissions {
  can_view_products: boolean;
  can_download_assets: boolean;
  can_copy_content: boolean;
  can_view_shared_folders: boolean;
}

// Extended organization types for UI
export interface OrganizationWithRelationship extends Organization {
  relationshipStatus?: string;
  permissions?: WorkspacePermissions;
}

// User membership types
export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'partner';

export interface OrganizationMember {
  id: string;
  organizationId: string;
  kindeUserId: string;
  email: string;
  role: UserRole;
  canDownloadAssets: boolean;
  canEditProducts: boolean;
  canManageTeam: boolean;
  permissions: Record<string, any>;
  joinedAt: string;
  status: 'active' | 'suspended' | 'left';
  invitedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPermissions {
  role: UserRole | null;
  can_download_assets: boolean;
  can_edit_products: boolean;
  can_manage_team: boolean;
  is_owner: boolean;
  is_admin: boolean;
  is_partner: boolean;
}

// Legacy - kept for backward compatibility
export interface OrganizationMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'team_member' | 'partner';
  permissions: Record<string, any>;
  status: 'pending' | 'active' | 'inactive';
  invitedBy: string;
  joinedAt: string;
}

// DAM types
export interface DamFolder {
  id: string;
  organizationId: string;
  name: string;
  parentId: string | null;
  path: string;
  createdBy: string;
  createdAt: string;
}

export interface DamAsset {
  id: string;
  organizationId: string;
  folderId: string | null;
  filename: string;
  originalFilename: string;
  fileType: string;
   assetType?: string;
   assetScope?: string;
  fileSize: number;
  mimeType: string;
   filePath?: string;
  s3Key: string;
  s3Url: string;
  thumbnailUrls?: {
    small?: string;
    medium?: string;
    large?: string;
  };
  metadata?: Record<string, any>;
  tags: string[];
  description?: string;
   productIdentifiers?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DamCollection {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  assetIds: string[];
  createdBy: string;
  createdAt: string;
}

export interface AssetTag {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetCategory {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  parentId?: string | null;
  path: string;
  description?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetTagAssignment {
  id: string;
  assetId: string;
  tagId: string;
  assignedBy?: string | null;
  assignedAt: string;
  tag?: AssetTag;
}

export interface AssetCategoryAssignment {
  id: string;
  assetId: string;
  categoryId: string;
  isPrimary: boolean;
  assignedBy?: string | null;
  assignedAt: string;
  category?: AssetCategory;
}

// API types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Upload types
export interface UploadRequest {
  filename: string;
  contentType: string;
  folderId?: string;
}

export interface UploadResponse {
  uploadUrl: string;
  key: string;
  assetId: string;
}

export interface FileUploadProgress {
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

// Billing types
export * from './billing';
export * from './product';
export * from './product-table';
