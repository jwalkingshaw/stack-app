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
  fileSize: number;
  mimeType: string;
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