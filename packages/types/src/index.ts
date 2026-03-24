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
  website?: string;
  description?: string;
  logoUrl?: string;
  defaultUiLocale?: string;
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
  uiLocaleOverride?: string | null;
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

export type AssetStatus = 'draft' | 'active' | 'archived' | 'retired';
export type ComplianceStatus = 'Pending' | 'Approved' | 'Rejected' | 'Under Review';
export type BrandLegalApproval = 'Pending' | 'Approved' | 'Rejected';
export type ClaimsReviewStatus = 'pending' | 'approved' | 'challenged' | 'expired';
export type UsageTerritory = 'Global' | 'US' | 'EU' | 'APAC' | 'Other';
export type LicenseOwnership = 'Work for Hire' | 'UGC License' | 'Licensed' | 'Owned' | 'Rights-Managed';
export type ColorProfile = 'RGB' | 'sRGB' | 'CMYK' | 'Pantone' | 'Greyscale';
export type PrintVsDigital = 'print' | 'digital';
export type EndorsementType = 'Sponsored Athlete' | 'Paid Partnership' | 'UGC' | 'Ambassador';
export type WadaRiskLevel = 'none' | 'low' | 'flagged';
export type ArtworkType =
  | 'Front Panel' | 'Back Panel' | 'Side Panel' | 'Carton'
  | 'Shipper' | 'Tray' | 'Insert' | 'Hang Tag' | 'Hero Shot'
  | 'Lifestyle' | 'Ingredient Focus' | 'Before/After'
  | '360 Render' | '3D Render' | 'Social Graphic' | 'Other';

export interface DamAsset {
  id: string;
  organizationId: string;
  folderId: string | null;
  filename: string;
  originalFilename: string;
  fileType: string;
  assetType?: string;
  assetScope?: string;
  assetStatus: AssetStatus;
  currentVersionNumber?: number;
  currentVersionComment?: string | null;
  currentVersionEffectiveFrom?: string | null;
  currentVersionEffectiveTo?: string | null;
  currentVersionChangedBy?: string | null;
  currentVersionChangedAt?: string | null;
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
  width?: number | null;
  height?: number | null;
  metadata?: Record<string, any>;
  tags: string[];
  description?: string;
  productIdentifiers?: string[];

  // Compliance & approval
  complianceStatus?: ComplianceStatus | null;
  brandLegalApproval?: BrandLegalApproval | null;
  claimsReviewStatus?: ClaimsReviewStatus | null;

  // Rights & talent
  talentPresent?: boolean | null;
  releaseOnFile?: boolean | null;
  usageEnd?: string | null;
  usageTerritory?: UsageTerritory | null;
  licenseOwnership?: LicenseOwnership | null;
  usagePlatforms: string[];
  ftcDisclosureRequired?: boolean | null;
  athleteNames: string[];
  talentContractEnd?: string | null;
  endorsementType?: EndorsementType | null;
  expirationDate?: string | null;

  // Regulatory & certifications
  regulatoryRegion: string[];
  certifications: string[];
  visibleClaims: string[];
  claimsApprovedMarkets: string[];
  wadaRiskLevel: WadaRiskLevel;

  // Accessibility
  altText?: string | null;

  // Label / artwork classification
  artworkType?: ArtworkType | null;
  colorProfile?: ColorProfile | null;
  printVsDigital: PrintVsDigital;
  resolutionDpi?: number | null;
  labelVersion?: string | null;
  formulaVersion?: string | null;

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
