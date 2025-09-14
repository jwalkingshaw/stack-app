// Product Information Management (PIM) Types for Nutrition/CPG Brands

export type DoseForm = 'Powder' | 'Capsule' | 'RTD' | 'Tablet' | 'Gummy' | 'Softgel' | 'Liquid' | 'Bar' | 'Other';
export type ProductStatus = 'Development' | 'Active' | 'Discontinued' | 'Pending Launch';
export type ComplianceStatus = 'Pending' | 'Approved' | 'Rejected' | 'Under Review' | 'Expired';
export type WeightUnit = 'g' | 'kg' | 'oz' | 'lb' | 'mg';
export type VolumeUnit = 'ml' | 'l' | 'fl oz' | 'cup';

// Nutritional information structure
export interface NutritionFact {
  nutrient: string;
  amount: number;
  unit: string;
  dailyValuePercent?: number;
  per100g?: number;
}

export interface NutritionPanel {
  servingSize: string;
  servingsPerContainer?: number;
  calories: number;
  macronutrients: {
    protein?: NutritionFact;
    carbohydrates?: NutritionFact;
    totalFat?: NutritionFact;
    saturatedFat?: NutritionFact;
    transFat?: NutritionFact;
    cholesterol?: NutritionFact;
    sodium?: NutritionFact;
    totalSugars?: NutritionFact;
    addedSugars?: NutritionFact;
    dietaryFiber?: NutritionFact;
  };
  vitaminsAndMinerals?: NutritionFact[];
  otherNutrients?: NutritionFact[];
}

export interface Ingredient {
  name: string;
  percentage?: number;
  isActive: boolean;
  allergenInfo?: string[];
  origin?: string;
  certifications?: string[];
}

export interface RegulatoryInfo {
  region: string; // 'US', 'EU', 'Canada', etc.
  status: ComplianceStatus;
  registrationNumber?: string;
  approvalDate?: string;
  expiryDate?: string;
  claims: string[];
  warnings: string[];
  mandatoryDisclosures: string[];
}

// Main Product interface
export interface Product {
  // Core Identity
  id: string;
  sku: string;
  upc?: string;
  gtin?: string;
  productName: string;
  brandLine: string;
  productFamily?: string; // e.g., "Elite Series", "Essential Line"
  
  // Physical Specifications  
  doseForm: DoseForm;
  flavor?: string;
  size: string; // Display size like "2lb", "60 capsules"
  netWeight?: number;
  netWeightUnit?: WeightUnit;
  netVolume?: number;
  netVolumeUnit?: VolumeUnit;
  servingsPerContainer?: number;
  servingSize?: string;
  
  // Product Details
  description: string;
  keyBenefits: string[];
  targetAudience: string[];
  intendedUse: string[];
  directions: string;
  warnings?: string[];
  
  // Nutritional & Compliance
  nutritionFacts?: NutritionPanel;
  ingredients: Ingredient[];
  allergens: string[];
  certifications: string[]; // 'Organic', 'Non-GMO', 'Third-Party Tested', etc.
  regulatoryInfo: RegulatoryInfo[];
  
  // Supply Chain & Manufacturing
  supplier: string;
  manufacturingLocation: string;
  shelfLifeMonths: number;
  storageConditions: string;
  batchCodeFormat?: string;
  
  // Commercial Information
  category: string[];
  msrp?: number;
  currency?: string;
  costOfGoods?: number;
  marginTarget?: number;
  
  // Asset Relationships
  primaryImage?: string; // Asset ID
  ecommerceImages: string[]; // Asset IDs for product shots
  packagingAssets: string[]; // Asset IDs for label designs, packaging
  marketingAssets: string[]; // Asset IDs for lifestyle, social, campaigns
  
  // Lifecycle & Status
  developmentStartDate?: string;
  launchDate?: string;
  discontinueDate?: string;
  status: ProductStatus;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastModifiedBy: string;
  version: number;
  
  // Search & Organization
  tags: string[];
  internalNotes?: string;
}

// Product variant for different sizes/flavors of same base product
export interface ProductVariant {
  id: string;
  parentProductId: string;
  variantType: 'Size' | 'Flavor' | 'Count' | 'Formulation';
  variantValue: string;
  sku: string;
  upc?: string;
  
  // Override fields that differ from parent
  size?: string;
  flavor?: string;
  netWeight?: number;
  netWeightUnit?: WeightUnit;
  servingsPerContainer?: number;
  msrp?: number;
  
  // Variant-specific assets
  primaryImage?: string;
  ecommerceImages: string[];
  
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

// Product-Asset relationship tracking
export interface ProductAssetLink {
  id: string;
  productId: string;
  assetId: string;
  linkType: 'Primary Image' | 'E-commerce' | 'Packaging' | 'Marketing' | 'Lifestyle' | 'Social Media';
  isPrimary: boolean;
  displayOrder?: number;
  campaign?: string;
  channel?: string;
  usageContext?: string;
  createdAt: string;
  createdBy: string;
}

// Product performance and analytics
export interface ProductAnalytics {
  productId: string;
  period: string; // '30d', '90d', 'ytd', etc.
  
  // Asset performance
  totalAssets: number;
  assetsByType: Record<string, number>;
  topPerformingAssets: string[]; // Asset IDs
  
  // Marketing reach (if integrated with marketing platforms)
  totalImpressions?: number;
  totalEngagement?: number;
  assetUtilization?: number; // % of assets actually used
  
  // Commercial metrics (if integrated with sales systems)
  revenue?: number;
  units?: number;
  conversionRate?: number;
  
  lastUpdated: string;
}