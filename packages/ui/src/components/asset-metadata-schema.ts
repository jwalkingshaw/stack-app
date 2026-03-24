// Asset Metadata Schema for Supplements & Sports Nutrition Brands
export type AssetScope = 'Product' | 'Campaign' | 'Brand' | 'Corporate';
export type FileType = 'image' | 'video' | 'document' | 'other';
export type AssetStatus = 'draft' | 'active' | 'archived' | 'retired';
export type PrintVsDigital = 'print' | 'digital';

export interface ValidationRule {
  required?: boolean;
  requiredWhen?: (data: AssetMetadata) => boolean;
  validate?: (value: any, data: AssetMetadata) => string | null;
  derive?: (data: AssetMetadata) => any;
}

export interface FieldSchema {
  key: string;
  label: string;
  type: 'text' | 'select' | 'multiselect' | 'boolean' | 'number' | 'date' | 'textarea';
  options?: { value: string; label: string }[];
  validation?: ValidationRule;
  placeholder?: string;
  group: 'basic' | 'product' | 'marketing' | 'rights' | 'workflow' | 'compliance' | 'artwork' | 'regulatory';
  width?: 'sm' | 'md' | 'lg' | 'xl';
  searchable?: boolean;
  sortable?: boolean;
  bulkEditable?: boolean;
}

// Core Asset Metadata Interface
export interface AssetMetadata {
  // Auto-populated fields
  id: string;
  filename: string;
  originalFilename: string;
  fileType: FileType;
  fileSize: number;
  mimeType: string;
  preview?: string;
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'error';
  width?: number | null;
  height?: number | null;

  // Required baseline metadata
  assetScope: AssetScope;
  assetStatus: AssetStatus;
  productIdentifiers?: string[]; // SKU/UPC/GTIN — required if Product scope
  campaignInitiative?: string;   // required if Campaign scope
  brandBusinessUnit?: string;    // required if Brand scope
  folder: string;
  tags: string[];
  category?: string;
  description?: string;

  // Product-specific metadata (when assetScope = Product)
  parentSku?: string;
  flavor?: string;
  doseForm?: 'Powder' | 'Capsule' | 'RTD' | 'Tablet' | 'Gummy' | 'Other';
  variantSize?: string;
  netContents?: number;
  netContentsUnit?: 'g' | 'kg' | 'ml' | 'l' | 'oz' | 'lb' | 'servings' | 'capsules';
  allergens?: string[];
  intendedUse?: string[];
  mandatoryDisclosures?: string;
  expirationDate?: string;

  // Label & artwork classification (new — supplements-specific)
  artworkType?: string;
  colorProfile?: string;
  printVsDigital?: PrintVsDigital;
  resolutionDpi?: number;
  labelVersion?: string;
  formulaVersion?: string;

  // Marketing/Brand metadata (when assetScope = Campaign or Brand)
  applicableProducts?: string[];
  channels?: string[];
  placementUseCase?: string;
  locale?: string;
  altText?: string;
  regionMarket?: string;

  // Regulatory & certifications (new — promoted from JSONB)
  certifications?: string[];
  regulatoryRegion?: string[];
  complianceStatus?: string;
  visibleClaims?: string[];
  claimsApprovedMarkets?: string[];
  wadaRiskLevel?: string;

  // Rights & Approvals
  talentPresent?: boolean;
  athleteNames?: string[];         // new — was talentNames in JSONB
  talentContractEnd?: string;      // new
  endorsementType?: string;        // new
  releaseOnFile?: boolean;
  usageRestrictions?: string;
  licenseOwnership?: string;
  usageTerritory?: string;
  usagePlatforms?: string[];
  usageStart?: string;
  usageEnd?: string;
  brandLegalApproval?: string;
  approver?: string;
  approvalTimestamp?: string;
  ftcDisclosureRequired?: boolean;
  disclosureText?: string;

  // Workflow/System metadata
  version?: string;
  supersedesAssetId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  sourceOfTruth?: 'PIM' | 'Agency' | 'Studio' | 'UGC' | 'Internal';
  perceptualHash?: string;
  approvalStatus?: 'Brand' | 'Regulatory' | 'Channel QA' | 'Complete';

  // Validation state
  errors?: Record<string, string>;
  warnings?: Record<string, string>;
  isValid?: boolean;
}

// ── Option lists ──────────────────────────────────────────────────────────

export const ASSET_SCOPE_OPTIONS = [
  { value: 'Product', label: 'Product' },
  { value: 'Campaign', label: 'Campaign' },
  { value: 'Brand', label: 'Brand' },
  { value: 'Corporate', label: 'Corporate' },
];

export const ASSET_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'retired', label: 'Retired' },
];

export const ARTWORK_TYPE_OPTIONS = [
  { value: 'Front Panel', label: 'Front Panel' },
  { value: 'Back Panel', label: 'Back Panel' },
  { value: 'Side Panel', label: 'Side Panel' },
  { value: 'Carton', label: 'Carton' },
  { value: 'Shipper', label: 'Shipper' },
  { value: 'Tray', label: 'Tray' },
  { value: 'Insert', label: 'Insert' },
  { value: 'Hang Tag', label: 'Hang Tag' },
  { value: 'Hero Shot', label: 'Hero Shot' },
  { value: 'Lifestyle', label: 'Lifestyle' },
  { value: 'Ingredient Focus', label: 'Ingredient Focus' },
  { value: 'Before/After', label: 'Before / After' },
  { value: '360 Render', label: '360° Render' },
  { value: '3D Render', label: '3D Render' },
  { value: 'Social Graphic', label: 'Social Graphic' },
  { value: 'Other', label: 'Other' },
];

export const COLOR_PROFILE_OPTIONS = [
  { value: 'sRGB', label: 'sRGB (web / digital)' },
  { value: 'RGB', label: 'RGB (generic)' },
  { value: 'CMYK', label: 'CMYK (print)' },
  { value: 'Pantone', label: 'Pantone (spot colour)' },
  { value: 'Greyscale', label: 'Greyscale' },
];

export const PRINT_VS_DIGITAL_OPTIONS = [
  { value: 'digital', label: 'Digital' },
  { value: 'print', label: 'Print / Production' },
];

export const DOSE_FORM_OPTIONS = [
  { value: 'Powder', label: 'Powder' },
  { value: 'Capsule', label: 'Capsule' },
  { value: 'RTD', label: 'Ready-to-Drink' },
  { value: 'Tablet', label: 'Tablet' },
  { value: 'Gummy', label: 'Gummy' },
  { value: 'Other', label: 'Other' },
];

export const CHANNEL_OPTIONS = [
  { value: 'Paid Social', label: 'Paid Social' },
  { value: 'POS', label: 'Point of Sale' },
  { value: 'Retail Media', label: 'Retail Media' },
  { value: 'OOH', label: 'Out of Home' },
  { value: 'Email', label: 'Email Marketing' },
  { value: 'Website', label: 'Website' },
  { value: 'Print', label: 'Print' },
  { value: 'Packaging', label: 'Packaging' },
];

export const REGION_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'EU', label: 'European Union' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Australia', label: 'Australia' },
  { value: 'APAC', label: 'Asia Pacific' },
  { value: 'Global', label: 'Global' },
  { value: 'Other', label: 'Other' },
];

export const CERTIFICATION_OPTIONS = [
  { value: 'NSF', label: 'NSF Certified' },
  { value: 'Informed Sport', label: 'Informed Sport' },
  { value: 'Informed Choice', label: 'Informed Choice' },
  { value: 'USP Verified', label: 'USP Verified' },
  { value: 'Organic', label: 'USDA Organic' },
  { value: 'Non-GMO', label: 'Non-GMO Project' },
  { value: 'Gluten-Free', label: 'Gluten-Free Certified' },
  { value: 'Vegan', label: 'Certified Vegan' },
  { value: 'Kosher', label: 'Kosher' },
  { value: 'Halal', label: 'Halal' },
  { value: 'Banned Substance Free', label: 'Banned Substance Free' },
];

export const ALLERGEN_OPTIONS = [
  { value: 'Milk', label: 'Milk' },
  { value: 'Eggs', label: 'Eggs' },
  { value: 'Fish', label: 'Fish' },
  { value: 'Shellfish', label: 'Shellfish' },
  { value: 'Tree Nuts', label: 'Tree Nuts' },
  { value: 'Peanuts', label: 'Peanuts' },
  { value: 'Wheat', label: 'Wheat' },
  { value: 'Soybeans', label: 'Soybeans' },
  { value: 'Sesame', label: 'Sesame' },
];

export const INTENDED_USE_OPTIONS = [
  { value: 'Pre-Workout', label: 'Pre-Workout' },
  { value: 'Post-Workout', label: 'Post-Workout' },
  { value: 'Hydration', label: 'Hydration' },
  { value: 'Recovery', label: 'Recovery' },
  { value: 'Weight Management', label: 'Weight Management' },
  { value: 'General Health', label: 'General Health' },
  { value: 'Performance', label: 'Performance' },
  { value: 'Endurance', label: 'Endurance' },
];

export const ENDORSEMENT_TYPE_OPTIONS = [
  { value: 'Sponsored Athlete', label: 'Sponsored Athlete' },
  { value: 'Paid Partnership', label: 'Paid Partnership' },
  { value: 'UGC', label: 'User Generated Content' },
  { value: 'Ambassador', label: 'Brand Ambassador' },
];

export const WADA_RISK_OPTIONS = [
  { value: 'none', label: 'No Risk' },
  { value: 'low', label: 'Low Risk' },
  { value: 'flagged', label: 'Flagged' },
];

export const LICENSE_OWNERSHIP_OPTIONS = [
  { value: 'Owned', label: 'Owned / Work for Hire' },
  { value: 'Work for Hire', label: 'Work for Hire' },
  { value: 'Licensed', label: 'Licensed' },
  { value: 'Rights-Managed', label: 'Rights-Managed' },
  { value: 'UGC License', label: 'UGC License' },
];

// ── Field schema definitions ──────────────────────────────────────────────

export const ASSET_METADATA_SCHEMA: Record<string, FieldSchema> = {

  // ── Basic fields (always visible) ──

  filename: {
    key: 'filename', label: 'File Name', type: 'text',
    group: 'basic', width: 'md', searchable: true, sortable: true, bulkEditable: true,
    validation: { required: true },
  },
  assetScope: {
    key: 'assetScope', label: 'Asset Scope', type: 'select',
    options: ASSET_SCOPE_OPTIONS,
    group: 'basic', width: 'sm', bulkEditable: true,
    validation: { required: true },
  },
  assetStatus: {
    key: 'assetStatus', label: 'Status', type: 'select',
    options: ASSET_STATUS_OPTIONS,
    group: 'basic', width: 'sm', bulkEditable: true,
    validation: { required: true },
  },
  folder: {
    key: 'folder', label: 'Folder', type: 'select',
    options: [
      { value: 'Main', label: 'Main' },
      { value: 'Products', label: 'Products' },
      { value: 'Marketing', label: 'Marketing' },
      { value: 'Labels', label: 'Labels' },
      { value: 'Social', label: 'Social' },
      { value: 'Legal', label: 'Legal' },
      { value: 'Regulatory', label: 'Regulatory' },
    ],
    group: 'basic', width: 'sm', bulkEditable: true,
    validation: { required: true },
  },
  tags: {
    key: 'tags', label: 'Tags', type: 'multiselect',
    group: 'basic', width: 'md', searchable: true, bulkEditable: true,
  },
  category: {
    key: 'category', label: 'Category', type: 'select',
    options: [
      { value: 'Product Shot', label: 'Product Shot' },
      { value: 'Lifestyle', label: 'Lifestyle' },
      { value: 'Before/After', label: 'Before/After' },
      { value: 'Ingredient Focus', label: 'Ingredient Focus' },
      { value: 'Social Content', label: 'Social Content' },
      { value: 'Marketing Material', label: 'Marketing Material' },
      { value: 'Label / Artwork', label: 'Label / Artwork' },
      { value: 'Regulatory Document', label: 'Regulatory Document' },
    ],
    group: 'basic', width: 'md', bulkEditable: true,
  },
  description: {
    key: 'description', label: 'Description', type: 'textarea',
    group: 'basic', width: 'lg', searchable: true, bulkEditable: true,
  },
  altText: {
    key: 'altText', label: 'Alt Text', type: 'text',
    placeholder: 'Describe the image for screen readers and retail listings',
    group: 'basic', width: 'lg', bulkEditable: true,
  },

  // ── Artwork / label classification ──

  artworkType: {
    key: 'artworkType', label: 'Artwork Type', type: 'select',
    options: ARTWORK_TYPE_OPTIONS,
    group: 'artwork', width: 'md', bulkEditable: true, sortable: true,
  },
  colorProfile: {
    key: 'colorProfile', label: 'Colour Profile', type: 'select',
    options: COLOR_PROFILE_OPTIONS,
    group: 'artwork', width: 'sm', bulkEditable: true,
  },
  printVsDigital: {
    key: 'printVsDigital', label: 'Use', type: 'select',
    options: PRINT_VS_DIGITAL_OPTIONS,
    group: 'artwork', width: 'sm', bulkEditable: true,
  },
  resolutionDpi: {
    key: 'resolutionDpi', label: 'Resolution (DPI)', type: 'number',
    placeholder: 'e.g. 300 for print, 72 for web',
    group: 'artwork', width: 'sm', sortable: true,
  },
  labelVersion: {
    key: 'labelVersion', label: 'Label Version', type: 'text',
    placeholder: 'e.g. v3.2',
    group: 'artwork', width: 'sm', searchable: true, bulkEditable: true,
  },
  formulaVersion: {
    key: 'formulaVersion', label: 'Formula Version', type: 'text',
    placeholder: 'e.g. F-2024-03',
    group: 'artwork', width: 'sm', searchable: true, bulkEditable: true,
  },

  // ── Product-specific fields ──

  productIdentifiers: {
    key: 'productIdentifiers', label: 'SKU / UPC / GTIN', type: 'multiselect',
    group: 'product', width: 'md', searchable: true, bulkEditable: true,
    validation: { requiredWhen: (data) => data.assetScope === 'Product' },
  },
  parentSku: {
    key: 'parentSku', label: 'Parent SKU', type: 'text',
    group: 'product', width: 'sm', searchable: true, bulkEditable: true,
  },
  flavor: {
    key: 'flavor', label: 'Flavor', type: 'text',
    group: 'product', width: 'sm', searchable: true, bulkEditable: true,
  },
  doseForm: {
    key: 'doseForm', label: 'Dose Form', type: 'select',
    options: DOSE_FORM_OPTIONS,
    group: 'product', width: 'sm', bulkEditable: true,
  },

  // ── Regulatory & certifications ──

  certifications: {
    key: 'certifications', label: 'Certifications', type: 'multiselect',
    options: CERTIFICATION_OPTIONS,
    group: 'regulatory', width: 'md', bulkEditable: true,
  },
  regulatoryRegion: {
    key: 'regulatoryRegion', label: 'Regulatory Region', type: 'multiselect',
    options: REGION_OPTIONS,
    group: 'regulatory', width: 'md', bulkEditable: true,
  },
  complianceStatus: {
    key: 'complianceStatus', label: 'Compliance Status', type: 'select',
    options: [
      { value: 'Pending', label: 'Pending Review' },
      { value: 'Approved', label: 'Approved' },
      { value: 'Rejected', label: 'Rejected' },
      { value: 'Under Review', label: 'Under Review' },
    ],
    group: 'regulatory', width: 'sm', bulkEditable: true, sortable: true,
  },
  visibleClaims: {
    key: 'visibleClaims', label: 'Visible Claims', type: 'multiselect',
    placeholder: 'Claims visually shown in this asset (e.g. "30g Protein")',
    group: 'regulatory', width: 'lg', bulkEditable: true, searchable: true,
  },
  claimsApprovedMarkets: {
    key: 'claimsApprovedMarkets', label: 'Claims Approved For', type: 'multiselect',
    options: REGION_OPTIONS,
    group: 'regulatory', width: 'md', bulkEditable: true,
  },
  wadaRiskLevel: {
    key: 'wadaRiskLevel', label: 'WADA Risk', type: 'select',
    options: WADA_RISK_OPTIONS,
    group: 'regulatory', width: 'sm', bulkEditable: true, sortable: true,
  },

  // ── Campaign / Marketing ──

  campaignInitiative: {
    key: 'campaignInitiative', label: 'Campaign / Initiative', type: 'text',
    group: 'marketing', width: 'md', searchable: true, bulkEditable: true,
    validation: { requiredWhen: (data) => data.assetScope === 'Campaign' },
  },
  brandBusinessUnit: {
    key: 'brandBusinessUnit', label: 'Brand / Business Unit', type: 'text',
    group: 'marketing', width: 'md', searchable: true, bulkEditable: true,
    validation: { requiredWhen: (data) => data.assetScope === 'Brand' },
  },
  channels: {
    key: 'channels', label: 'Channels', type: 'multiselect',
    options: CHANNEL_OPTIONS,
    group: 'marketing', width: 'md', bulkEditable: true,
  },
  regionMarket: {
    key: 'regionMarket', label: 'Region / Market', type: 'select',
    options: REGION_OPTIONS,
    group: 'marketing', width: 'sm', bulkEditable: true,
  },

  // ── Rights & Talent ──

  talentPresent: {
    key: 'talentPresent', label: 'Talent Present', type: 'boolean',
    group: 'rights', width: 'sm', bulkEditable: true,
  },
  athleteNames: {
    key: 'athleteNames', label: 'Athlete / Talent Names', type: 'multiselect',
    placeholder: 'Names of athletes or influencers in this asset',
    group: 'rights', width: 'md', searchable: true, bulkEditable: true,
  },
  endorsementType: {
    key: 'endorsementType', label: 'Endorsement Type', type: 'select',
    options: ENDORSEMENT_TYPE_OPTIONS,
    group: 'rights', width: 'sm', bulkEditable: true,
  },
  talentContractEnd: {
    key: 'talentContractEnd', label: 'Contract End Date', type: 'date',
    group: 'rights', width: 'sm', sortable: true,
    validation: {
      requiredWhen: (data) =>
        Boolean(data.talentPresent) &&
        ['Sponsored Athlete', 'Paid Partnership', 'Ambassador'].includes(data.endorsementType ?? ''),
    },
  },
  releaseOnFile: {
    key: 'releaseOnFile', label: 'Release On File', type: 'boolean',
    group: 'rights', width: 'sm', bulkEditable: true,
    validation: { requiredWhen: (data) => data.talentPresent === true },
  },
  licenseOwnership: {
    key: 'licenseOwnership', label: 'License / Ownership', type: 'select',
    options: LICENSE_OWNERSHIP_OPTIONS,
    group: 'rights', width: 'sm', bulkEditable: true,
  },
  usageTerritory: {
    key: 'usageTerritory', label: 'Usage Territory', type: 'select',
    options: REGION_OPTIONS,
    group: 'rights', width: 'sm', bulkEditable: true,
  },
  usagePlatforms: {
    key: 'usagePlatforms', label: 'Approved Platforms', type: 'multiselect',
    options: CHANNEL_OPTIONS,
    group: 'rights', width: 'md', bulkEditable: true,
  },
  usageEnd: {
    key: 'usageEnd', label: 'Rights Expiry', type: 'date',
    group: 'rights', width: 'sm', sortable: true,
  },

  // ── Compliance ──

  brandLegalApproval: {
    key: 'brandLegalApproval', label: 'Brand / Legal Approval', type: 'select',
    options: [
      { value: 'Pending', label: 'Pending' },
      { value: 'Approved', label: 'Approved' },
      { value: 'Rejected', label: 'Rejected' },
    ],
    group: 'compliance', width: 'sm', bulkEditable: true, sortable: true,
  },
  ftcDisclosureRequired: {
    key: 'ftcDisclosureRequired', label: 'FTC Disclosure Required', type: 'boolean',
    group: 'compliance', width: 'sm', bulkEditable: true,
  },
  disclosureText: {
    key: 'disclosureText', label: 'Disclosure Text', type: 'textarea',
    group: 'compliance', width: 'lg',
    validation: { requiredWhen: (data) => data.ftcDisclosureRequired === true },
  },
};

// ── Field visibility helpers ──────────────────────────────────────────────

export function getVisibleFields(assetScope: AssetScope): FieldSchema[] {
  const always = Object.values(ASSET_METADATA_SCHEMA).filter((f) =>
    ['basic', 'artwork', 'rights', 'compliance', 'regulatory'].includes(f.group)
  );

  if (assetScope === 'Product') {
    return [
      ...always,
      ...Object.values(ASSET_METADATA_SCHEMA).filter((f) => f.group === 'product'),
    ];
  }

  if (assetScope === 'Campaign' || assetScope === 'Brand') {
    return [
      ...always,
      ...Object.values(ASSET_METADATA_SCHEMA).filter((f) => f.group === 'marketing'),
    ];
  }

  return always;
}

// ── Validation ────────────────────────────────────────────────────────────

export function validateAssetMetadata(data: AssetMetadata): {
  errors: Record<string, string>;
  warnings: Record<string, string>;
  isValid: boolean;
} {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  for (const field of getVisibleFields(data.assetScope)) {
    const value = (data as any)[field.key];

    if (
      field.validation?.required &&
      (!value || (Array.isArray(value) && value.length === 0))
    ) {
      errors[field.key] = `${field.label} is required`;
    }

    if (
      field.validation?.requiredWhen?.(data) &&
      (!value || (Array.isArray(value) && value.length === 0))
    ) {
      errors[field.key] = `${field.label} is required`;
    }

    if (field.validation?.validate && value) {
      const msg = field.validation.validate(value, data);
      if (msg) errors[field.key] = msg;
    }
  }

  // Business-logic warnings
  if (data.talentPresent && !data.releaseOnFile) {
    warnings.releaseOnFile = 'Release form recommended when talent is present';
  }

  if (data.ftcDisclosureRequired && !data.disclosureText) {
    errors.disclosureText = 'Disclosure text is required when FTC disclosure is needed';
  }

  if (
    data.colorProfile === 'CMYK' &&
    data.printVsDigital !== 'print'
  ) {
    warnings.printVsDigital = 'CMYK colour profile is typically for print use';
  }

  if (
    data.resolutionDpi !== undefined &&
    data.resolutionDpi < 300 &&
    data.printVsDigital === 'print'
  ) {
    warnings.resolutionDpi = 'Print assets typically require ≥300 DPI';
  }

  return { errors, warnings, isValid: Object.keys(errors).length === 0 };
}
