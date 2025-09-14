// Asset Metadata Schema for Nutrition & CPG Brands
export type AssetScope = 'Product' | 'Campaign' | 'Brand' | 'Corporate';

export type FileType = 'image' | 'video' | 'document' | 'other';

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
  group: 'basic' | 'product' | 'marketing' | 'rights' | 'workflow' | 'compliance';
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
  
  // Required baseline metadata
  assetScope: AssetScope;
  productIdentifiers?: string[]; // SKU/UPC/GTIN - required if Product scope
  campaignInitiative?: string; // required if Campaign scope
  brandBusinessUnit?: string; // required if Brand scope
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
  certifications?: string[];
  intendedUse?: string[];
  regulatoryRegion?: string[];
  complianceStatus?: 'Pending' | 'Approved' | 'Rejected' | 'Under Review';
  claimsBasis?: string;
  mandatoryDisclosures?: string;
  expirationDate?: string;
  
  // Marketing/Brand metadata (when assetScope = Campaign or Brand)
  applicableProducts?: string[]; // Multi-SKU association
  regionMarket?: 'US' | 'EU' | 'APAC' | 'Global' | 'Other';
  channels?: string[];
  placementUseCase?: string;
  locale?: string;
  altText?: string;
  
  // Rights & Approvals (all asset types)
  talentPresent?: boolean;
  talentNames?: string[];
  releaseOnFile?: boolean;
  usageRestrictions?: string;
  licenseOwnership?: 'Work for Hire' | 'UGC License' | 'Licensed' | 'Owned' | 'Rights-Managed';
  usageTerritory?: 'Global' | 'US' | 'EU' | 'APAC' | 'Other';
  usagePlatforms?: string[];
  usageStart?: string;
  usageEnd?: string;
  brandLegalApproval?: 'Pending' | 'Approved' | 'Rejected';
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

// Predefined options for dropdowns
export const ASSET_SCOPE_OPTIONS = [
  { value: 'Product', label: '📦 Product' },
  { value: 'Campaign', label: '🎯 Campaign' },
  { value: 'Brand', label: '🏢 Brand' },
  { value: 'Corporate', label: '🏛️ Corporate' }
];

export const DOSE_FORM_OPTIONS = [
  { value: 'Powder', label: 'Powder' },
  { value: 'Capsule', label: 'Capsule' },
  { value: 'RTD', label: 'Ready-to-Drink' },
  { value: 'Tablet', label: 'Tablet' },
  { value: 'Gummy', label: 'Gummy' },
  { value: 'Other', label: 'Other' }
];

export const CHANNEL_OPTIONS = [
  { value: 'Paid Social', label: 'Paid Social' },
  { value: 'POS', label: 'Point of Sale' },
  { value: 'Retail Media', label: 'Retail Media' },
  { value: 'OOH', label: 'Out of Home' },
  { value: 'Email', label: 'Email Marketing' },
  { value: 'Website', label: 'Website' },
  { value: 'Print', label: 'Print' },
  { value: 'Packaging', label: 'Packaging' }
];

export const REGION_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'EU', label: 'European Union' },
  { value: 'APAC', label: 'Asia Pacific' },
  { value: 'Global', label: 'Global' },
  { value: 'Other', label: 'Other' }
];

export const CERTIFICATION_OPTIONS = [
  { value: 'NSF', label: 'NSF Certified' },
  { value: 'Informed Sport', label: 'Informed Sport' },
  { value: 'Organic', label: 'USDA Organic' },
  { value: 'Non-GMO', label: 'Non-GMO Project' },
  { value: 'Gluten-Free', label: 'Gluten-Free' },
  { value: 'Vegan', label: 'Vegan' },
  { value: 'Kosher', label: 'Kosher' },
  { value: 'Halal', label: 'Halal' }
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
  { value: 'Sesame', label: 'Sesame' }
];

export const INTENDED_USE_OPTIONS = [
  { value: 'Pre-Workout', label: 'Pre-Workout' },
  { value: 'Post-Workout', label: 'Post-Workout' },
  { value: 'Hydration', label: 'Hydration' },
  { value: 'Recovery', label: 'Recovery' },
  { value: 'Weight Management', label: 'Weight Management' },
  { value: 'General Health', label: 'General Health' },
  { value: 'Performance', label: 'Performance' },
  { value: 'Endurance', label: 'Endurance' }
];

// Schema definition for conditional validation and rendering
export const ASSET_METADATA_SCHEMA: Record<string, FieldSchema> = {
  // Basic Fields (always visible)
  filename: {
    key: 'filename',
    label: 'File Name',
    type: 'text',
    group: 'basic',
    width: 'md',
    searchable: true,
    sortable: true,
    bulkEditable: true,
    validation: { required: true }
  },
  assetScope: {
    key: 'assetScope',
    label: 'Asset Scope',
    type: 'select',
    options: ASSET_SCOPE_OPTIONS,
    group: 'basic',
    width: 'sm',
    bulkEditable: true,
    validation: { required: true }
  },
  folder: {
    key: 'folder',
    label: 'Folder',
    type: 'select',
    options: [
      { value: 'Main', label: 'Main' },
      { value: 'Products', label: 'Products' },
      { value: 'Marketing', label: 'Marketing' },
      { value: 'Social', label: 'Social' },
      { value: 'Legal', label: 'Legal' }
    ],
    group: 'basic',
    width: 'sm',
    bulkEditable: true,
    validation: { required: true }
  },
  tags: {
    key: 'tags',
    label: 'Tags',
    type: 'multiselect',
    group: 'basic',
    width: 'md',
    searchable: true,
    bulkEditable: true
  },
  category: {
    key: 'category',
    label: 'Category',
    type: 'select',
    options: [
      { value: 'Product Shot', label: 'Product Shot' },
      { value: 'Lifestyle', label: 'Lifestyle' },
      { value: 'Before/After', label: 'Before/After' },
      { value: 'Ingredient Focus', label: 'Ingredient Focus' },
      { value: 'Social Content', label: 'Social Content' },
      { value: 'Marketing Material', label: 'Marketing Material' }
    ],
    group: 'basic',
    width: 'md',
    bulkEditable: true
  },
  description: {
    key: 'description',
    label: 'Description',
    type: 'textarea',
    group: 'basic',
    width: 'lg',
    searchable: true,
    bulkEditable: true
  },
  
  // Product-specific fields (visible when assetScope = Product)
  productIdentifiers: {
    key: 'productIdentifiers',
    label: 'SKU/UPC/GTIN',
    type: 'multiselect',
    group: 'product',
    width: 'md',
    searchable: true,
    bulkEditable: true,
    validation: {
      requiredWhen: (data) => data.assetScope === 'Product'
    }
  },
  parentSku: {
    key: 'parentSku',
    label: 'Parent SKU',
    type: 'text',
    group: 'product',
    width: 'sm',
    searchable: true,
    bulkEditable: true
  },
  flavor: {
    key: 'flavor',
    label: 'Flavor',
    type: 'text',
    group: 'product',
    width: 'sm',
    searchable: true,
    bulkEditable: true
  },
  doseForm: {
    key: 'doseForm',
    label: 'Dose/Form',
    type: 'select',
    options: DOSE_FORM_OPTIONS,
    group: 'product',
    width: 'sm',
    bulkEditable: true
  },
  
  // Campaign/Marketing fields (visible when assetScope = Campaign or Brand)
  campaignInitiative: {
    key: 'campaignInitiative',
    label: 'Campaign/Initiative',
    type: 'text',
    group: 'marketing',
    width: 'md',
    searchable: true,
    bulkEditable: true,
    validation: {
      requiredWhen: (data) => data.assetScope === 'Campaign'
    }
  },
  brandBusinessUnit: {
    key: 'brandBusinessUnit',
    label: 'Brand/Business Unit',
    type: 'text',
    group: 'marketing',
    width: 'md',
    searchable: true,
    bulkEditable: true,
    validation: {
      requiredWhen: (data) => data.assetScope === 'Brand'
    }
  },
  channels: {
    key: 'channels',
    label: 'Channels',
    type: 'multiselect',
    options: CHANNEL_OPTIONS,
    group: 'marketing',
    width: 'md',
    bulkEditable: true
  },
  
  // Rights & Approvals
  talentPresent: {
    key: 'talentPresent',
    label: 'Talent Present',
    type: 'boolean',
    group: 'rights',
    width: 'sm',
    bulkEditable: true
  },
  releaseOnFile: {
    key: 'releaseOnFile',
    label: 'Release On File',
    type: 'boolean',
    group: 'rights',
    width: 'sm',
    bulkEditable: true,
    validation: {
      requiredWhen: (data) => data.talentPresent === true
    }
  },
  usageTerritory: {
    key: 'usageTerritory',
    label: 'Usage Territory',
    type: 'select',
    options: REGION_OPTIONS,
    group: 'rights',
    width: 'sm',
    bulkEditable: true
  },
  
  // Compliance
  brandLegalApproval: {
    key: 'brandLegalApproval',
    label: 'Brand/Legal Approval',
    type: 'select',
    options: [
      { value: 'Pending', label: 'Pending' },
      { value: 'Approved', label: 'Approved' },
      { value: 'Rejected', label: 'Rejected' }
    ],
    group: 'compliance',
    width: 'sm',
    bulkEditable: true
  },
  ftcDisclosureRequired: {
    key: 'ftcDisclosureRequired',
    label: 'FTC Disclosure Required',
    type: 'boolean',
    group: 'compliance',
    width: 'sm',
    bulkEditable: true
  }
};

// Helper function to get visible fields based on asset scope
export function getVisibleFields(assetScope: AssetScope): FieldSchema[] {
  const baseFields = Object.values(ASSET_METADATA_SCHEMA).filter(field => 
    field.group === 'basic' || field.group === 'rights' || field.group === 'compliance'
  );
  
  if (assetScope === 'Product') {
    const productFields = Object.values(ASSET_METADATA_SCHEMA).filter(field => 
      field.group === 'product'
    );
    return [...baseFields, ...productFields];
  }
  
  if (assetScope === 'Campaign' || assetScope === 'Brand') {
    const marketingFields = Object.values(ASSET_METADATA_SCHEMA).filter(field => 
      field.group === 'marketing'
    );
    return [...baseFields, ...marketingFields];
  }
  
  return baseFields;
}

// Validation helper
export function validateAssetMetadata(data: AssetMetadata): { errors: Record<string, string>; warnings: Record<string, string>; isValid: boolean } {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  
  const visibleFields = getVisibleFields(data.assetScope);
  
  for (const field of visibleFields) {
    const value = (data as any)[field.key];
    
    // Check required fields
    if (field.validation?.required && (!value || (Array.isArray(value) && value.length === 0))) {
      errors[field.key] = `${field.label} is required`;
    }
    
    // Check conditional required fields
    if (field.validation?.requiredWhen && field.validation.requiredWhen(data) && (!value || (Array.isArray(value) && value.length === 0))) {
      errors[field.key] = `${field.label} is required for ${data.assetScope} assets`;
    }
    
    // Custom validation
    if (field.validation?.validate && value) {
      const validationError = field.validation.validate(value, data);
      if (validationError) {
        errors[field.key] = validationError;
      }
    }
  }
  
  // Specific business logic validations
  if (data.talentPresent && !data.releaseOnFile) {
    warnings.releaseOnFile = 'Release form recommended when talent is present';
  }
  
  if (data.ftcDisclosureRequired && !data.disclosureText) {
    errors.disclosureText = 'Disclosure text required when FTC disclosure is required';
  }
  
  return {
    errors,
    warnings,
    isValid: Object.keys(errors).length === 0
  };
}