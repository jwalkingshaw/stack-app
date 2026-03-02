// Mock data with parent-child variant relationships

// Variant axis definition
interface VariantAxis {
  size?: string;
  flavor?: string;
  color?: string;
  pack?: string;
  [key: string]: string | undefined;
}

// Content inheritance rules
interface ContentInheritance {
  [field: string]: 'inherit' | 'override' | 'append';
}

// Core PIM data structure with variant support
export interface PIMProduct {
  id: string;
  organizationId?: string;
  organizationSlug?: string;
  organizationName?: string;
  
  // Product hierarchy
  type: 'parent' | 'variant' | 'standalone';
  parentId?: string; // null for parent/standalone products
  variantAxis?: VariantAxis;
  hasVariants?: boolean; // true for parent products
  variantCount?: number; // number of child variants
  
  // Core product data
  productName: string;
  scin?: string;
  sku: string | null;
  upc?: string;
  brandLine?: string;
  family?: string; // Sports nutrition product family (Protein, Pre-Workout, Creatine, etc.)
  category?: string[];
  status: 'Draft' | 'Enrichment' | 'Review' | 'Active' | 'Discontinued' | 'Archived';
  launchDate?: string;
  msrp?: number;
  costOfGoods?: number;
  marginPercent?: number;
  
  // Content inheritance (for variants)
  inheritance?: ContentInheritance;
  isInherited?: {
    [field: string]: boolean;
  };
  
  // System fields
  assetsCount: number;
  contentScore: number; // 0-100% of required fields completed
  lastModified: string;
  lastModifiedBy: string;
}

export const MOCK_PIM_PRODUCTS: PIMProduct[] = [
  // Parent Product: Elite Whey Protein
  {
    id: "prod_001",
    type: "parent",
    hasVariants: true,
    variantCount: 18,
    productName: "Elite Whey Protein",
    sku: "EWP-PARENT",
    brandLine: "Elite Series",
    family: "Protein",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    assetsCount: 12, // Shared + variant-specific assets
    contentScore: 92,
    lastModified: "2024-01-30T10:30:00Z",
    lastModifiedBy: "jane@example.com"
  },
  // Variant 1: Chocolate 2lb
  {
    id: "prod_001_v1",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Chocolate", size: "2lb" },
    productName: "Elite Whey Protein - Chocolate",
    sku: "EWP-CHOC-2LB",
    upc: "123456789012",
    brandLine: "Elite Series",
    family: "Protein",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 49.99,
    costOfGoods: 22.50,
    marginPercent: 55,
    assetsCount: 8,
    contentScore: 95,
    inheritance: {
      productName: 'override',
      brandLine: 'inherit',
      category: 'inherit'
    },
    isInherited: {
      brandLine: true,
      category: true,
      productName: false
    },
    lastModified: "2024-01-30T10:30:00Z",
    lastModifiedBy: "jane@example.com"
  },
  // Variant 2: Vanilla 5lb
  {
    id: "prod_001_v2",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Vanilla", size: "5lb" },
    productName: "Elite Whey Protein - Vanilla",
    sku: "EWP-VAN-5LB",
    upc: "123456789013",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 89.99,
    costOfGoods: 41.50,
    marginPercent: 54,
    assetsCount: 6,
    contentScore: 88,
    inheritance: {
      productName: 'override',
      brandLine: 'inherit',
      category: 'inherit'
    },
    isInherited: {
      brandLine: true,
      category: true,
      productName: false
    },
    lastModified: "2024-01-28T15:45:00Z",
    lastModifiedBy: "mike@example.com"
  },
  // Variant 3: Strawberry 2lb (Limited Edition)
  {
    id: "prod_001_v3",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Strawberry", size: "2lb" },
    productName: "Elite Whey Protein - Strawberry Limited Edition",
    sku: "EWP-STRA-2LB-LE",
    upc: "123456789014",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition", "Limited Edition"],
    status: "Draft",
    launchDate: "2024-03-01",
    msrp: 54.99,
    costOfGoods: 24.00,
    marginPercent: 56,
    assetsCount: 4,
    contentScore: 75, // Still being developed
    inheritance: {
      productName: 'override',
      brandLine: 'inherit',
      category: 'append' // Added "Limited Edition"
    },
    isInherited: {
      brandLine: true,
      category: false, // Customized with additional category
      productName: false
    },
    lastModified: "2024-01-25T09:15:00Z",
    lastModifiedBy: "sarah@example.com"
  },
  // Additional variants for Elite Whey Protein (to test 15+ variant display)
  {
    id: "prod_001_v4",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Cookies & Cream", size: "5lb" },
    productName: "Elite Whey Protein - Cookies & Cream",
    sku: "EWP-CC-5LB",
    upc: "123456789016",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 89.99,
    costOfGoods: 41.50,
    marginPercent: 54,
    assetsCount: 7,
    contentScore: 90,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-30T10:30:00Z",
    lastModifiedBy: "jane@example.com"
  },
  {
    id: "prod_001_v5",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Banana", size: "2lb" },
    productName: "Elite Whey Protein - Banana",
    sku: "EWP-BAN-2LB",
    upc: "123456789017",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 49.99,
    costOfGoods: 22.50,
    marginPercent: 55,
    assetsCount: 6,
    contentScore: 88,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-29T14:20:00Z",
    lastModifiedBy: "mike@example.com"
  },
  {
    id: "prod_001_v6",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Peanut Butter", size: "5lb" },
    productName: "Elite Whey Protein - Peanut Butter",
    sku: "EWP-PB-5LB",
    upc: "123456789018",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 89.99,
    costOfGoods: 41.50,
    marginPercent: 54,
    assetsCount: 8,
    contentScore: 92,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-30T16:45:00Z",
    lastModifiedBy: "sarah@example.com"
  },
  {
    id: "prod_001_v7",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Chocolate", size: "10lb" },
    productName: "Elite Whey Protein - Chocolate Bulk",
    sku: "EWP-CHOC-10LB",
    upc: "123456789019",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 159.99,
    costOfGoods: 75.00,
    marginPercent: 53,
    assetsCount: 5,
    contentScore: 85,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-28T11:30:00Z",
    lastModifiedBy: "jane@example.com"
  },
  {
    id: "prod_001_v8",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Vanilla", size: "10lb" },
    productName: "Elite Whey Protein - Vanilla Bulk",
    sku: "EWP-VAN-10LB",
    upc: "123456789020",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 159.99,
    costOfGoods: 75.00,
    marginPercent: 53,
    assetsCount: 6,
    contentScore: 87,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-29T13:15:00Z",
    lastModifiedBy: "mike@example.com"
  },
  {
    id: "prod_001_v9",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Mixed Berry", size: "2lb" },
    productName: "Elite Whey Protein - Mixed Berry",
    sku: "EWP-BERRY-2LB",
    upc: "123456789021",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Draft",
    launchDate: "2024-03-15",
    msrp: 52.99,
    costOfGoods: 24.00,
    marginPercent: 55,
    assetsCount: 3,
    contentScore: 70,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-26T09:45:00Z",
    lastModifiedBy: "sarah@example.com"
  },
  {
    id: "prod_001_v10",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Chocolate Mint", size: "2lb" },
    productName: "Elite Whey Protein - Chocolate Mint",
    sku: "EWP-CHOCMINT-2LB",
    upc: "123456789022",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Draft",
    launchDate: "2024-04-01",
    msrp: 54.99,
    costOfGoods: 25.00,
    marginPercent: 54,
    assetsCount: 2,
    contentScore: 65,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-24T15:30:00Z",
    lastModifiedBy: "mike@example.com"
  },
  {
    id: "prod_001_v11",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Unflavored", size: "5lb" },
    productName: "Elite Whey Protein - Unflavored",
    sku: "EWP-UNFLA-5LB",
    upc: "123456789023",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 84.99,
    costOfGoods: 39.00,
    marginPercent: 54,
    assetsCount: 4,
    contentScore: 82,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-27T12:00:00Z",
    lastModifiedBy: "jane@example.com"
  },
  {
    id: "prod_001_v12",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Caramel", size: "2lb" },
    productName: "Elite Whey Protein - Caramel",
    sku: "EWP-CAR-2LB",
    upc: "123456789024",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 51.99,
    costOfGoods: 23.50,
    marginPercent: 55,
    assetsCount: 7,
    contentScore: 89,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-30T08:45:00Z",
    lastModifiedBy: "sarah@example.com"
  },
  {
    id: "prod_001_v13",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Coconut", size: "5lb" },
    productName: "Elite Whey Protein - Coconut",
    sku: "EWP-COC-5LB",
    upc: "123456789025",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 87.99,
    costOfGoods: 40.50,
    marginPercent: 54,
    assetsCount: 5,
    contentScore: 84,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-28T14:30:00Z",
    lastModifiedBy: "mike@example.com"
  },
  {
    id: "prod_001_v14",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Cinnamon Roll", size: "2lb" },
    productName: "Elite Whey Protein - Cinnamon Roll",
    sku: "EWP-CIN-2LB",
    upc: "123456789026",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Draft",
    launchDate: "2024-05-01",
    msrp: 53.99,
    costOfGoods: 24.50,
    marginPercent: 55,
    assetsCount: 1,
    contentScore: 60,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-22T10:15:00Z",
    lastModifiedBy: "sarah@example.com"
  },
  {
    id: "prod_001_v15",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Mocha", size: "2lb" },
    productName: "Elite Whey Protein - Mocha",
    sku: "EWP-MOCHA-2LB",
    upc: "123456789027",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 50.99,
    costOfGoods: 23.00,
    marginPercent: 55,
    assetsCount: 6,
    contentScore: 86,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-29T16:20:00Z",
    lastModifiedBy: "jane@example.com"
  },
  {
    id: "prod_001_v16",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Tropical Punch", size: "5lb" },
    productName: "Elite Whey Protein - Tropical Punch",
    sku: "EWP-TROP-5LB",
    upc: "123456789028",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 86.99,
    costOfGoods: 40.00,
    marginPercent: 54,
    assetsCount: 7,
    contentScore: 90,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-30T12:30:00Z",
    lastModifiedBy: "mike@example.com"
  },
  {
    id: "prod_001_v17",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Birthday Cake", size: "2lb" },
    productName: "Elite Whey Protein - Birthday Cake",
    sku: "EWP-CAKE-2LB",
    upc: "123456789029",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Draft",
    launchDate: "2024-06-01",
    msrp: 55.99,
    costOfGoods: 25.50,
    marginPercent: 54,
    assetsCount: 2,
    contentScore: 55,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-20T14:45:00Z",
    lastModifiedBy: "sarah@example.com"
  },
  {
    id: "prod_001_v18",
    type: "variant",
    parentId: "prod_001",
    variantAxis: { flavor: "Salted Caramel", size: "5lb" },
    productName: "Elite Whey Protein - Salted Caramel",
    sku: "EWP-SALTCAR-5LB",
    upc: "123456789030",
    brandLine: "Elite Series",
    category: ["Protein", "Sports Nutrition"],
    status: "Active",
    launchDate: "2024-01-15",
    msrp: 88.99,
    costOfGoods: 41.00,
    marginPercent: 54,
    assetsCount: 8,
    contentScore: 93,
    inheritance: { productName: 'override', brandLine: 'inherit', category: 'inherit' },
    isInherited: { brandLine: true, category: true, productName: false },
    lastModified: "2024-01-31T09:30:00Z",
    lastModifiedBy: "jane@example.com"
  },
  // Parent Product: Premium Multivitamin (20 variants - shows "View XX variations" link)
  {
    id: "prod_002",
    type: "parent",
    hasVariants: true,
    variantCount: 20,
    productName: "Premium Daily Multivitamin",
    sku: "MULTI-PARENT",
    brandLine: "Wellness Line",
    family: "Vitamins",
    category: ["Vitamins", "Daily Health"],
    status: "Active",
    launchDate: "2023-06-01",
    assetsCount: 25,
    contentScore: 85,
    lastModified: "2024-01-25T14:20:00Z",
    lastModifiedBy: "sarah@example.com"
  },
  // Standalone Product: Pure Creatine
  {
    id: "prod_003",
    type: "standalone",
    productName: "Pure Creatine Monohydrate",
    sku: "CREAT-PURE-300G",
    upc: "123456789015",
    brandLine: "Essential Line",
    family: "Creatine",
    category: ["Creatine", "Performance"],
    status: "Active",
    launchDate: "2023-08-20",
    msrp: 29.99,
    costOfGoods: 12.00,
    marginPercent: 60,
    assetsCount: 5,
    contentScore: 88,
    lastModified: "2024-01-28T15:45:00Z",
    lastModifiedBy: "mike@example.com"
  }
];

export const STATUS_COLORS = {
  "Draft": "bg-blue-100 text-blue-800 border-0",
  "Enrichment": "bg-indigo-100 text-indigo-800 border-0",
  "Review": "bg-amber-100 text-amber-800 border-0",
  "Active": "bg-green-100 text-green-800 border-0",
  "Discontinued": "bg-red-100 text-red-800 border-0",
  "Archived": "bg-slate-100 text-slate-700 border-0"
};
