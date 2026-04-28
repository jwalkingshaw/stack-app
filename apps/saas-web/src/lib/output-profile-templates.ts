/**
 * Output profile templates.
 *
 * Each template defines:
 *  - The field group to scaffold (code, name, description)
 *  - The product fields to create and assign to that group
 *  - The profile field rules (required flag, max_length, notes)
 *
 * Used by the scaffold endpoint:
 *   POST /api/[tenant]/output-profiles/[profileId]/scaffold
 *
 * Field codes in each template are prefixed by channel to avoid collisions
 * with system fields and other channel templates.
 *
 * ── Asset / image fields ──────────────────────────────────────────────────────
 * File-type fields are DAM pickers — they store a reference to an asset ID,
 * not a copy. The asset lives once in S3. The field records which DAM asset
 * fills a given channel slot for a given product.
 *
 * This enables: Amazon main image = white-bg hero; Shopify = lifestyle hero;
 * Portal = transparent PNG — all pointing to different DAM assets, one record.
 *
 * The export API resolves these references to CDN URLs at export time.
 *
 * ── Cross-group field references ──────────────────────────────────────────────
 * field_rules can reference field codes from OTHER field groups (e.g. system
 * fields like `coa_documents` from the Compliance group). The scaffold endpoint
 * does NOT create those fields — they already exist. This is the loose
 * field_code coupling working as designed.
 */

export type TemplateFieldSeed = {
  code: string;
  name: string;
  description: string;
  field_type: 'text' | 'textarea' | 'number' | 'select' | 'measurement' | 'identifier' | 'file' | 'table';
  is_localizable: boolean;
  sort_order: number;
  validation_rules: Record<string, unknown>;
  options: Record<string, unknown>;
};

export type TemplateFieldRule = {
  field_code: string;
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
};

export type TemplateAttributeMapping = {
  attribute_code: string;
  attribute_label: string;
  source_mode: 'shared_field' | 'destination_field' | 'slot' | 'constant';
  source_field_code?: string | null;
  override_field_code?: string | null;
  source_slot_code?: string | null;
  constant_value?: string | null;
  resolution_rule: 'destination_override_then_base' | 'base_only' | 'destination_only';
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
  sort_order?: number;
};

export type OutputProfileTemplate = {
  /** Short identifier used to look up the template, e.g. 'amazon'. */
  key: string;
  /** Human name shown in the UI. */
  name: string;
  description: string;
  profile_type: 'portal' | 'marketplace' | 'retail' | 'export' | 'api';
  /** Code for the field group that will be created. UNIQUE(org, code). */
  group_code: string;
  /** Display name for the scaffolded field group. */
  group_name: string;
  group_description: string;
  /** Fields to upsert into product_fields and assign to the group. */
  fields: TemplateFieldSeed[];
  /**
   * Rules to upsert into output_profile_field_rules.
   * field_code must match a code in fields[] or an existing org field.
   */
  field_rules: TemplateFieldRule[];
  attribute_mappings?: TemplateAttributeMapping[];
};

// ─── Amazon ──────────────────────────────────────────────────────────────────
// Sources: Amazon Seller Central listing requirements + SP-API ItemType schema.
// Limits: title 200, bullets 255 each, description 2000, search_terms 250.

const AMAZON_FIELDS: TemplateFieldSeed[] = [
  /* {
    code: 'amazon_title',
    name: 'Amazon Title',
    description: 'Product title shown on the Amazon detail page. Max 200 characters including spaces.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 10,
    validation_rules: { max_length: 200 },
    options: { max_length: 200 },
  },
  /* {
    code: 'amazon_brand',
    name: 'Amazon Brand',
    description: 'Registered brand name as it appears on Amazon. Must match your Brand Registry entry.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 20,
    validation_rules: { max_length: 50 },
    options: { max_length: 50 },
  }, */
  {
    code: 'amazon_manufacturer',
    name: 'Amazon Manufacturer',
    description: 'Manufacturer name. Used for Amazon\'s brand/manufacturer distinction on the detail page.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 30,
    validation_rules: { max_length: 50 },
    options: { max_length: 50 },
  },
  {
    code: 'amazon_bullet_1',
    name: 'Bullet Point 1',
    description: 'First feature bullet. Displayed in the top feature list on the Amazon detail page.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 40,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'amazon_bullet_2',
    name: 'Bullet Point 2',
    description: 'Second feature bullet. Max 255 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 50,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'amazon_bullet_3',
    name: 'Bullet Point 3',
    description: 'Third feature bullet. Max 255 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 60,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'amazon_bullet_4',
    name: 'Bullet Point 4',
    description: 'Fourth feature bullet. Max 255 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 70,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'amazon_bullet_5',
    name: 'Bullet Point 5',
    description: 'Fifth feature bullet. Max 255 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 80,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'amazon_description',
    name: 'Amazon Product Description',
    description: 'Long-form product description (plain text). HTML tags are stripped by Amazon. Max 2000 characters.',
    field_type: 'textarea',
    is_localizable: true,
    sort_order: 90,
    validation_rules: { max_length: 2000 },
    options: { max_length: 2000, rows: 8 },
  },
  {
    code: 'amazon_search_terms',
    name: 'Search Terms (Backend Keywords)',
    description: 'Space-separated backend keywords. Not visible to shoppers. Max 250 bytes. Do not repeat words from the title.',
    field_type: 'textarea',
    is_localizable: true,
    sort_order: 100,
    validation_rules: { max_length: 250 },
    options: { max_length: 250, rows: 3 },
  },
  // ── Image slots (DAM pickers) ───────────────────────────────────────────────
  // Amazon allows up to 9 images. Image 1 (MAIN) has strict requirements:
  // pure white/off-white background, product fills ≥85% of frame, min 1000px
  // on the shortest side. Images 2–8 can show lifestyle, angles, infographics.
  {
    code: 'amazon_image_1',
    name: 'Main Image',
    description: 'Primary Amazon product image (MAIN slot). Pure white background required. Product must fill ≥85% of frame. Min 1000px shortest side. JPEG or PNG.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 110,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'amazon_image_2',
    name: 'Image 2',
    description: 'Second Amazon image slot. Lifestyle, angle, or ingredient callout shot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 120,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'amazon_image_3',
    name: 'Image 3',
    description: 'Third Amazon image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 130,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'amazon_image_4',
    name: 'Image 4',
    description: 'Fourth Amazon image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 140,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'amazon_image_5',
    name: 'Image 5',
    description: 'Fifth Amazon image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 150,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'amazon_image_6',
    name: 'Image 6',
    description: 'Sixth Amazon image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 160,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'amazon_image_7',
    name: 'Image 7',
    description: 'Seventh Amazon image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 170,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'amazon_image_8',
    name: 'Image 8',
    description: 'Eighth Amazon image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 180,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
];

const AMAZON_RULES: TemplateFieldRule[] = [
  { field_code: 'amazon_title',       is_required: true,  max_length: 200, notes: 'Required for listing. Keyword-rich, avoid ALL CAPS and promotional phrases.' },
  { field_code: 'amazon_brand',       is_required: true,  max_length: 50,  notes: 'Must match your Amazon Brand Registry name.' },
  { field_code: 'amazon_manufacturer',is_required: false, max_length: 50,  notes: null },
  { field_code: 'amazon_bullet_1',    is_required: true,  max_length: 255, notes: 'Lead with the hero claim or key benefit.' },
  { field_code: 'amazon_bullet_2',    is_required: true,  max_length: 255, notes: null },
  { field_code: 'amazon_bullet_3',    is_required: false, max_length: 255, notes: null },
  { field_code: 'amazon_bullet_4',    is_required: false, max_length: 255, notes: null },
  { field_code: 'amazon_bullet_5',    is_required: false, max_length: 255, notes: null },
  { field_code: 'amazon_description', is_required: false, max_length: 2000,notes: 'Rendered as plain text by Amazon. No HTML.' },
  { field_code: 'amazon_search_terms',is_required: false, max_length: 250, notes: 'Backend only — counted in bytes not characters.' },
  // Images
  { field_code: 'amazon_image_1',     is_required: true,  max_length: null,notes: 'MAIN slot. White background, product fills ≥85%, min 1000px.' },
  { field_code: 'amazon_image_2',     is_required: false, max_length: null,notes: null },
  { field_code: 'amazon_image_3',     is_required: false, max_length: null,notes: null },
  { field_code: 'amazon_image_4',     is_required: false, max_length: null,notes: null },
  { field_code: 'amazon_image_5',     is_required: false, max_length: null,notes: null },
  { field_code: 'amazon_image_6',     is_required: false, max_length: null,notes: null },
  { field_code: 'amazon_image_7',     is_required: false, max_length: null,notes: null },
  { field_code: 'amazon_image_8',     is_required: false, max_length: null,notes: null },
];

// ─── Shopify ──────────────────────────────────────────────────────────────────
// Sources: Shopify Admin REST + GraphQL product schema.
// body_html accepts HTML; seo_title/description are surfaced in storefront <head>.

const SHOPIFY_FIELDS: TemplateFieldSeed[] = [
  {
    code: 'shopify_title',
    name: 'Shopify Title',
    description: 'Product title shown on the Shopify storefront product page.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 10,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'shopify_body_html',
    name: 'Product Description (HTML)',
    description: 'Full product description. HTML is rendered on the storefront. Use heading tags, lists, and bold sparingly.',
    field_type: 'textarea',
    is_localizable: true,
    sort_order: 20,
    validation_rules: {},
    options: { rows: 12 },
  },
  {
    code: 'shopify_vendor',
    name: 'Vendor',
    description: 'Brand or vendor name. Appears on the Shopify product page and is filterable in collections.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 30,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'shopify_product_type',
    name: 'Product Type',
    description: 'Shopify product type. Used for categorisation and collection rules (e.g. "Protein Powder", "Pre-Workout").',
    field_type: 'text',
    is_localizable: false,
    sort_order: 40,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'shopify_tags',
    name: 'Tags',
    description: 'Comma-separated tags. Used for collection rules, filtering, and search on the storefront.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 50,
    validation_rules: {},
    options: {},
  },
  {
    code: 'shopify_seo_title',
    name: 'SEO Title',
    description: 'Page title tag (<title>) used by search engines. If blank, Shopify uses the product title. Max 70 characters recommended.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 60,
    validation_rules: { max_length: 70 },
    options: { max_length: 70 },
  },
  {
    code: 'shopify_seo_description',
    name: 'SEO Description',
    description: 'Meta description tag used by search engines. Max 320 characters. Plain text only.',
    field_type: 'textarea',
    is_localizable: true,
    sort_order: 70,
    validation_rules: { max_length: 320 },
    options: { max_length: 320, rows: 4 },
  },
  {
    code: 'shopify_handle',
    name: 'URL Handle',
    description: 'URL slug for the product page (e.g. "whey-protein-chocolate-2lb"). Lowercase, hyphens only. Auto-generated from title if blank.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 80,
    validation_rules: { pattern: '^[a-z0-9-]+$', max_length: 255 },
    options: { max_length: 255 },
  },
  // ── Image slots (DAM pickers) ───────────────────────────────────────────────
  // Shopify renders featured_image as the primary product photo. Additional
  // images appear in the product gallery. No background restrictions.
  {
    code: 'shopify_featured_image',
    name: 'Featured Image',
    description: 'Primary product image shown in collections and at the top of the product page. Recommended: 1:1 ratio, min 2048px.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 90,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'shopify_image_2',
    name: 'Gallery Image 2',
    description: 'Second product gallery image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 100,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'shopify_image_3',
    name: 'Gallery Image 3',
    description: 'Third product gallery image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 110,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'shopify_image_4',
    name: 'Gallery Image 4',
    description: 'Fourth product gallery image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 120,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'shopify_image_5',
    name: 'Gallery Image 5',
    description: 'Fifth product gallery image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 130,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
];

const SHOPIFY_RULES: TemplateFieldRule[] = [
  { field_code: 'shopify_title',           is_required: true,  max_length: 255, notes: null },
  { field_code: 'shopify_body_html',        is_required: true,  max_length: null,notes: 'HTML accepted. Shopify renders this on the storefront.' },
  { field_code: 'shopify_vendor',           is_required: false, max_length: 255, notes: null },
  { field_code: 'shopify_product_type',     is_required: false, max_length: 255, notes: null },
  { field_code: 'shopify_tags',             is_required: false, max_length: null,notes: 'Comma-separated.' },
  { field_code: 'shopify_seo_title',        is_required: false, max_length: 70,  notes: 'Recommended ≤70 chars for Google snippets.' },
  { field_code: 'shopify_seo_description',  is_required: false, max_length: 320, notes: 'Recommended ≤160 chars for best SERP display.' },
  { field_code: 'shopify_handle',           is_required: false, max_length: 255, notes: 'Lowercase letters, numbers, and hyphens only.' },
  // Images
  { field_code: 'shopify_featured_image',   is_required: true,  max_length: null,notes: 'Primary product photo. Lifestyle or clean product shot.' },
  { field_code: 'shopify_image_2',          is_required: false, max_length: null,notes: null },
  { field_code: 'shopify_image_3',          is_required: false, max_length: null,notes: null },
  { field_code: 'shopify_image_4',          is_required: false, max_length: null,notes: null },
  { field_code: 'shopify_image_5',          is_required: false, max_length: null,notes: null },
];

// ─── Walmart ──────────────────────────────────────────────────────────────────
// Sources: Walmart Marketplace Seller Center content guidelines (2024).
// Limits: product_name 200, short_description 500, long_description 4000, key_features 1000 each.

const WALMART_FIELDS: TemplateFieldSeed[] = [
  {
    code: 'walmart_product_name',
    name: 'Walmart Product Name',
    description: 'Full product title on Walmart.com. Follow Walmart\'s title formula: Brand + Product Name + Variant (Flavor/Size). Max 200 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 10,
    validation_rules: { max_length: 200 },
    options: { max_length: 200 },
  },
  {
    code: 'walmart_brand',
    name: 'Walmart Brand',
    description: 'Brand name as registered with Walmart Marketplace. Must be consistent with the GTIN/barcode record.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 20,
    validation_rules: { max_length: 60 },
    options: { max_length: 60 },
  },
  {
    code: 'walmart_short_description',
    name: 'Short Description',
    description: 'Brief product description shown in search results and category pages. Max 500 characters.',
    field_type: 'textarea',
    is_localizable: true,
    sort_order: 30,
    validation_rules: { max_length: 500 },
    options: { max_length: 500, rows: 4 },
  },
  {
    code: 'walmart_long_description',
    name: 'Long Description',
    description: 'Full product description shown on the Walmart item detail page. Limited HTML (p, ul, li, b, br) accepted. Max 4000 characters.',
    field_type: 'textarea',
    is_localizable: true,
    sort_order: 40,
    validation_rules: { max_length: 4000 },
    options: { max_length: 4000, rows: 10 },
  },
  {
    code: 'walmart_key_feature_1',
    name: 'Key Feature 1',
    description: 'First feature highlight shown as a bullet on the Walmart item page. Max 1000 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 50,
    validation_rules: { max_length: 1000 },
    options: { max_length: 1000 },
  },
  {
    code: 'walmart_key_feature_2',
    name: 'Key Feature 2',
    description: 'Second feature highlight. Max 1000 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 60,
    validation_rules: { max_length: 1000 },
    options: { max_length: 1000 },
  },
  {
    code: 'walmart_key_feature_3',
    name: 'Key Feature 3',
    description: 'Third feature highlight. Max 1000 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 70,
    validation_rules: { max_length: 1000 },
    options: { max_length: 1000 },
  },
  {
    code: 'walmart_key_feature_4',
    name: 'Key Feature 4',
    description: 'Fourth feature highlight. Max 1000 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 80,
    validation_rules: { max_length: 1000 },
    options: { max_length: 1000 },
  },
  {
    code: 'walmart_key_feature_5',
    name: 'Key Feature 5',
    description: 'Fifth feature highlight. Max 1000 characters.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 90,
    validation_rules: { max_length: 1000 },
    options: { max_length: 1000 },
  },
  {
    code: 'walmart_manufacturer',
    name: 'Manufacturer',
    description: 'Manufacturer name. May differ from brand (e.g. brand = "Ghost", manufacturer = "Ghost Lifestyle LLC").',
    field_type: 'text',
    is_localizable: false,
    sort_order: 100,
    validation_rules: { max_length: 100 },
    options: { max_length: 100 },
  },
  // ── Image slots (DAM pickers) ───────────────────────────────────────────────
  // Walmart requires a minimum of 4 images for dietary supplements.
  // Main image: white or off-white background recommended. Min 1000px.
  // Additional images can be lifestyle, ingredient, label, or infographic shots.
  {
    code: 'walmart_image_1',
    name: 'Main Image',
    description: 'Primary Walmart product image. White or off-white background preferred. Min 1000px shortest side.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 110,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'walmart_image_2',
    name: 'Image 2',
    description: 'Second Walmart image. Lifestyle, angle, or ingredient callout.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 120,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'walmart_image_3',
    name: 'Image 3',
    description: 'Third Walmart image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 130,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'walmart_image_4',
    name: 'Image 4',
    description: 'Fourth Walmart image. Walmart requires at least 4 images for dietary supplements.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 140,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'walmart_image_5',
    name: 'Image 5',
    description: 'Fifth Walmart image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 150,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'walmart_image_6',
    name: 'Image 6',
    description: 'Sixth Walmart image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 160,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'walmart_image_7',
    name: 'Image 7',
    description: 'Seventh Walmart image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 170,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'walmart_image_8',
    name: 'Image 8',
    description: 'Eighth Walmart image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 180,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
];

const WALMART_RULES: TemplateFieldRule[] = [
  { field_code: 'walmart_product_name',     is_required: true,  max_length: 200,  notes: 'Formula: Brand + Product Name + Key Variant.' },
  { field_code: 'walmart_brand',            is_required: true,  max_length: 60,   notes: 'Must match GTIN/UPC brand record.' },
  { field_code: 'walmart_short_description',is_required: true,  max_length: 500,  notes: 'Displayed in search results. Plain text preferred.' },
  { field_code: 'walmart_long_description', is_required: false, max_length: 4000, notes: 'Limited HTML allowed (p, ul, li, b, br).' },
  { field_code: 'walmart_key_feature_1',    is_required: true,  max_length: 1000, notes: 'Walmart requires at least 3 key features for dietary supplements.' },
  { field_code: 'walmart_key_feature_2',    is_required: true,  max_length: 1000, notes: null },
  { field_code: 'walmart_key_feature_3',    is_required: true,  max_length: 1000, notes: null },
  { field_code: 'walmart_key_feature_4',    is_required: false, max_length: 1000, notes: null },
  { field_code: 'walmart_key_feature_5',    is_required: false, max_length: 1000, notes: null },
  { field_code: 'walmart_manufacturer',     is_required: false, max_length: 100,  notes: null },
  // Images — Walmart requires minimum 4 for dietary supplements
  { field_code: 'walmart_image_1',          is_required: true,  max_length: null, notes: 'Main image. White/off-white background. Min 1000px.' },
  { field_code: 'walmart_image_2',          is_required: true,  max_length: null, notes: null },
  { field_code: 'walmart_image_3',          is_required: true,  max_length: null, notes: null },
  { field_code: 'walmart_image_4',          is_required: true,  max_length: null, notes: 'Minimum 4 images required for dietary supplements.' },
  { field_code: 'walmart_image_5',          is_required: false, max_length: null, notes: null },
  { field_code: 'walmart_image_6',          is_required: false, max_length: null, notes: null },
  { field_code: 'walmart_image_7',          is_required: false, max_length: null, notes: null },
  { field_code: 'walmart_image_8',          is_required: false, max_length: null, notes: null },
];

// ─── Generic Portal ───────────────────────────────────────────────────────────
// For branded retailer portals, distributor portals, and custom B2B portals.
// Covers the full marketing asset set a retail or wholesale partner needs:
// content fields, product imagery, label artwork, sell sheet, spec sheet,
// and references to existing system fields (COA, certifications).
//
// NOTE: coa_documents and certifications are NOT created by this template —
// they already exist as system fields in the Compliance group. The field_rules
// below reference them by code (loose coupling). The scaffold endpoint will
// skip creating them and only add the rules.

const PORTAL_FIELDS: TemplateFieldSeed[] = [
  // ── Content fields ──────────────────────────────────────────────────────────
  {
    code: 'portal_title',
    name: 'Portal Title',
    description: 'Product title as it should appear in the partner portal. May differ from the storefront or marketplace title.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 10,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'portal_short_description',
    name: 'Short Description',
    description: 'One or two sentence product summary for portal listing pages and sell sheets.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 20,
    validation_rules: { max_length: 500 },
    options: { max_length: 500 },
  },
  {
    code: 'portal_description',
    name: 'Description',
    description: 'Full product description for the partner portal product detail page.',
    field_type: 'textarea',
    is_localizable: true,
    sort_order: 30,
    validation_rules: {},
    options: { rows: 8 },
  },
  {
    code: 'portal_brand',
    name: 'Brand',
    description: 'Brand name for the portal product record.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 40,
    validation_rules: { max_length: 100 },
    options: { max_length: 100 },
  },
  {
    code: 'portal_category',
    name: 'Category',
    description: "Product category as used by this partner's portal (e.g. \"Sports Nutrition > Protein\").",
    field_type: 'text',
    is_localizable: false,
    sort_order: 50,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'portal_upc',
    name: 'UPC / Barcode',
    description: 'UPC or GTIN required by this portal for inventory matching.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 60,
    validation_rules: { max_length: 14 },
    options: { max_length: 14 },
  },
  // ── Product imagery ─────────────────────────────────────────────────────────
  {
    code: 'portal_hero_image',
    name: 'Hero Image',
    description: 'Primary product image for the portal. Lifestyle or clean product shot. No background restriction.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 70,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'portal_lifestyle_image_1',
    name: 'Lifestyle Image 1',
    description: 'Lifestyle or in-use product image for the portal gallery.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 80,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'portal_lifestyle_image_2',
    name: 'Lifestyle Image 2',
    description: 'Second lifestyle image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 90,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'portal_lifestyle_image_3',
    name: 'Lifestyle Image 3',
    description: 'Third lifestyle image.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 100,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  // ── Label artwork ───────────────────────────────────────────────────────────
  {
    code: 'portal_label_front',
    name: 'Label — Front',
    description: 'Front panel label artwork. High-res PNG, PDF, or AI file. Used by retailers for print-ready or digital display.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 110,
    validation_rules: {},
    options: { asset_type: 'label_artwork', allow_multiple: false, allowed_mime_groups: ['image', 'pdf'] },
  },
  {
    code: 'portal_label_back',
    name: 'Label — Back',
    description: 'Back panel label artwork showing Supplement Facts, ingredients, directions, and warnings.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 120,
    validation_rules: {},
    options: { asset_type: 'label_artwork', allow_multiple: false, allowed_mime_groups: ['image', 'pdf'] },
  },
  // ── Marketing documents ─────────────────────────────────────────────────────
  {
    code: 'portal_sell_sheet',
    name: 'Sell Sheet',
    description: 'One or two-page product sell sheet PDF. Used by partners for internal sales and buyer presentations.',
    field_type: 'file',
    is_localizable: true,
    sort_order: 130,
    validation_rules: {},
    options: { asset_type: 'sell_sheet', allow_multiple: false, allowed_mime_groups: ['pdf'] },
  },
  {
    code: 'portal_spec_sheet',
    name: 'Product Spec Sheet',
    description: 'Technical product specification document — dimensions, weight, case pack, storage requirements.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 140,
    validation_rules: {},
    options: { asset_type: 'spec_sheet', allow_multiple: false, allowed_mime_groups: ['pdf', 'document'] },
  },
];

const PORTAL_RULES: TemplateFieldRule[] = [
  // Content
  { field_code: 'portal_title',              is_required: true,  max_length: 255, notes: null },
  { field_code: 'portal_short_description',  is_required: true,  max_length: 500, notes: null },
  { field_code: 'portal_description',        is_required: false, max_length: null,notes: null },
  { field_code: 'portal_brand',              is_required: false, max_length: 100, notes: null },
  { field_code: 'portal_category',           is_required: false, max_length: 255, notes: null },
  { field_code: 'portal_upc',                is_required: false, max_length: 14,  notes: 'GTIN-12 or GTIN-14.' },
  // Product imagery
  { field_code: 'portal_hero_image',          is_required: true,  max_length: null,notes: null },
  { field_code: 'portal_lifestyle_image_1',   is_required: false, max_length: null,notes: null },
  { field_code: 'portal_lifestyle_image_2',   is_required: false, max_length: null,notes: null },
  { field_code: 'portal_lifestyle_image_3',   is_required: false, max_length: null,notes: null },
  // Label artwork
  { field_code: 'portal_label_front',         is_required: false, max_length: null,notes: 'Required by some retail portals for planogram and print use.' },
  { field_code: 'portal_label_back',          is_required: false, max_length: null,notes: null },
  // Marketing documents
  { field_code: 'portal_sell_sheet',          is_required: false, max_length: null,notes: null },
  { field_code: 'portal_spec_sheet',          is_required: false, max_length: null,notes: null },
  // Cross-group system fields — NOT created by scaffold, already exist in Compliance group
  { field_code: 'coa_documents',              is_required: false, max_length: null,notes: 'COA from the Compliance group. Required by some retail partners.' },
  { field_code: 'certifications',             is_required: false, max_length: null,notes: 'NSF, Informed Sport, etc. from the Compliance group.' },
];

// ─── Mercado Libre ────────────────────────────────────────────────────────────
// Sources: MercadoLibre Items API v1 + Listing Content Policy (2024).
// Key constraints:
//   - Title: max 60 characters (strict — ML truncates beyond this)
//   - Description: plain text only (no HTML). Max 50,000 characters.
//   - condition: required enum (new / used)
//   - listing_type_id: determines visibility tier (free / bronze / silver / gold / gold_special / gold_pro)
//   - ML category IDs vary by country (MLA = Argentina, MLB = Brazil, MLM = Mexico, etc.)

const MERCADO_LIBRE_FIELDS: TemplateFieldSeed[] = [
  {
    code: 'meli_title',
    name: 'Mercado Libre Title',
    description: 'Product title on Mercado Libre. Strict 60-character limit — ML truncates beyond this. Include: Brand + Product + Variant + Size.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 10,
    validation_rules: { max_length: 60 },
    options: { max_length: 60 },
  },
  {
    code: 'meli_description',
    name: 'Description',
    description: 'Product description. Plain text only — no HTML, markdown, or line-break tags. ML renders this as-is. Max 50,000 characters.',
    field_type: 'textarea',
    is_localizable: true,
    sort_order: 20,
    validation_rules: { max_length: 50000 },
    options: { max_length: 50000, rows: 10 },
  },
  {
    code: 'meli_brand',
    name: 'Brand',
    description: 'Brand attribute submitted to Mercado Libre. Required for most Health & Beauty and Sports Nutrition categories.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 30,
    validation_rules: { max_length: 100 },
    options: { max_length: 100 },
  },
  {
    code: 'meli_condition',
    name: 'Condition',
    description: 'Item condition. Must be "new" for standard supplement listings. "used" and "refurbished" are rarely applicable.',
    field_type: 'select',
    is_localizable: false,
    sort_order: 40,
    validation_rules: {},
    options: {
      options: [
        { value: 'new',         label: 'New' },
        { value: 'used',        label: 'Used' },
        { value: 'refurbished', label: 'Refurbished' },
      ],
    },
  },
  {
    code: 'meli_listing_type_id',
    name: 'Listing Type',
    description: 'ML visibility tier. Gold Pro gives maximum placement in search. Free has limited exposure.',
    field_type: 'select',
    is_localizable: false,
    sort_order: 50,
    validation_rules: {},
    options: {
      options: [
        { value: 'gold_pro',    label: 'Gold Pro (max visibility)' },
        { value: 'gold_special',label: 'Gold Special' },
        { value: 'gold',        label: 'Gold' },
        { value: 'silver',      label: 'Silver' },
        { value: 'bronze',      label: 'Bronze' },
        { value: 'free',        label: 'Free (limited exposure)' },
      ],
    },
  },
  {
    code: 'meli_category_id',
    name: 'Category ID',
    description: 'Mercado Libre category ID for the target country (e.g. MLA109822 for Argentina protein powders, MLM415736 for Mexico). Look up via the ML Categories API.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 60,
    validation_rules: { pattern: '^ML[A-Z]+[0-9]+$', max_length: 20 },
    options: { max_length: 20 },
  },
  {
    code: 'meli_warranty',
    name: 'Warranty',
    description: 'Warranty description shown on the ML listing (e.g. "90 days seller warranty"). Required in some ML categories.',
    field_type: 'text',
    is_localizable: true,
    sort_order: 70,
    validation_rules: { max_length: 255 },
    options: { max_length: 255 },
  },
  {
    code: 'meli_video_id',
    name: 'YouTube Video ID',
    description: 'YouTube video ID (not full URL) for the product video shown on the ML listing (e.g. "dQw4w9WgXcQ"). ML embeds the video directly.',
    field_type: 'text',
    is_localizable: false,
    sort_order: 80,
    validation_rules: { pattern: '^[A-Za-z0-9_-]{11}$', max_length: 11 },
    options: { max_length: 11 },
  },
  // ── Image slots (DAM pickers) ───────────────────────────────────────────────
  // ML recommends up to 12 images. Image 1 is the primary listing photo.
  // No strict background requirement, but clean product shots perform better.
  // Min 500px. JPEG preferred; ML converts other formats.
  {
    code: 'meli_image_1',
    name: 'Main Image',
    description: 'Primary Mercado Libre listing image. Clean product shot, min 500px. JPEG preferred.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 90,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'meli_image_2',
    name: 'Image 2',
    description: 'Second ML image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 100,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'meli_image_3',
    name: 'Image 3',
    description: 'Third ML image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 110,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'meli_image_4',
    name: 'Image 4',
    description: 'Fourth ML image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 120,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'meli_image_5',
    name: 'Image 5',
    description: 'Fifth ML image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 130,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
  {
    code: 'meli_image_6',
    name: 'Image 6',
    description: 'Sixth ML image slot.',
    field_type: 'file',
    is_localizable: false,
    sort_order: 140,
    validation_rules: {},
    options: { asset_type: 'product_image', allow_multiple: false, allowed_mime_groups: ['image'] },
  },
];

const MERCADO_LIBRE_RULES: TemplateFieldRule[] = [
  { field_code: 'meli_title',           is_required: true,  max_length: 60,    notes: 'Strict 60-char limit. ML truncates silently beyond this.' },
  { field_code: 'meli_description',     is_required: true,  max_length: 50000, notes: 'Plain text only — no HTML or markdown.' },
  { field_code: 'meli_brand',           is_required: true,  max_length: 100,   notes: 'Required for Health & Beauty and Sports Nutrition categories.' },
  { field_code: 'meli_condition',       is_required: true,  max_length: null,  notes: 'Supplements must use "new".' },
  { field_code: 'meli_listing_type_id', is_required: false, max_length: null,  notes: 'Defaults to "gold_pro" for new items if not set via API.' },
  { field_code: 'meli_category_id',     is_required: false, max_length: 20,    notes: 'Country-specific. Use ML Categories API to find the right ID.' },
  { field_code: 'meli_warranty',        is_required: false, max_length: 255,   notes: 'Required in some ML country + category combinations.' },
  { field_code: 'meli_video_id',        is_required: false, max_length: 11,    notes: 'YouTube 11-char video ID only — not the full URL.' },
  // Images
  { field_code: 'meli_image_1',         is_required: true,  max_length: null,  notes: 'Main listing image. Min 500px. JPEG preferred.' },
  { field_code: 'meli_image_2',         is_required: false, max_length: null,  notes: null },
  { field_code: 'meli_image_3',         is_required: false, max_length: null,  notes: null },
  { field_code: 'meli_image_4',         is_required: false, max_length: null,  notes: null },
  { field_code: 'meli_image_5',         is_required: false, max_length: null,  notes: null },
  { field_code: 'meli_image_6',         is_required: false, max_length: null,  notes: null },
];

const AMAZON_ATTRIBUTE_MAPPINGS: TemplateAttributeMapping[] = [
  { attribute_code: 'title', attribute_label: 'Title', source_mode: 'shared_field', source_field_code: 'title', override_field_code: 'amazon_title', resolution_rule: 'destination_override_then_base', is_required: true, max_length: 200, notes: 'Uses Amazon title override when present.', sort_order: 10 },
  { attribute_code: 'brand', attribute_label: 'Brand', source_mode: 'shared_field', source_field_code: 'brand_name', override_field_code: 'amazon_brand', resolution_rule: 'destination_override_then_base', is_required: true, max_length: 50, notes: null, sort_order: 20 },
  { attribute_code: 'manufacturer', attribute_label: 'Manufacturer', source_mode: 'shared_field', source_field_code: 'manufacturer_name', override_field_code: 'amazon_manufacturer', resolution_rule: 'destination_override_then_base', is_required: false, max_length: 50, notes: null, sort_order: 30 },
  { attribute_code: 'bullet_1', attribute_label: 'Bullet 1', source_mode: 'destination_field', source_field_code: 'amazon_bullet_1', resolution_rule: 'destination_only', is_required: true, max_length: 255, notes: null, sort_order: 40 },
  { attribute_code: 'bullet_2', attribute_label: 'Bullet 2', source_mode: 'destination_field', source_field_code: 'amazon_bullet_2', resolution_rule: 'destination_only', is_required: true, max_length: 255, notes: null, sort_order: 50 },
  { attribute_code: 'bullet_3', attribute_label: 'Bullet 3', source_mode: 'destination_field', source_field_code: 'amazon_bullet_3', resolution_rule: 'destination_only', is_required: false, max_length: 255, notes: null, sort_order: 60 },
  { attribute_code: 'bullet_4', attribute_label: 'Bullet 4', source_mode: 'destination_field', source_field_code: 'amazon_bullet_4', resolution_rule: 'destination_only', is_required: false, max_length: 255, notes: null, sort_order: 70 },
  { attribute_code: 'bullet_5', attribute_label: 'Bullet 5', source_mode: 'destination_field', source_field_code: 'amazon_bullet_5', resolution_rule: 'destination_only', is_required: false, max_length: 255, notes: null, sort_order: 80 },
  { attribute_code: 'description', attribute_label: 'Description', source_mode: 'shared_field', source_field_code: 'long_description', override_field_code: 'amazon_description', resolution_rule: 'destination_override_then_base', is_required: false, max_length: 2000, notes: null, sort_order: 90 },
  { attribute_code: 'search_terms', attribute_label: 'Search Terms', source_mode: 'destination_field', source_field_code: 'amazon_search_terms', resolution_rule: 'destination_only', is_required: false, max_length: 250, notes: null, sort_order: 100 },
  { attribute_code: 'main_image', attribute_label: 'Main Image', source_mode: 'destination_field', source_field_code: 'amazon_image_1', resolution_rule: 'destination_only', is_required: true, max_length: null, notes: null, sort_order: 110 },
  { attribute_code: 'image_2', attribute_label: 'Image 2', source_mode: 'destination_field', source_field_code: 'amazon_image_2', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 120 },
  { attribute_code: 'image_3', attribute_label: 'Image 3', source_mode: 'destination_field', source_field_code: 'amazon_image_3', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 130 },
  { attribute_code: 'image_4', attribute_label: 'Image 4', source_mode: 'destination_field', source_field_code: 'amazon_image_4', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 140 },
  { attribute_code: 'image_5', attribute_label: 'Image 5', source_mode: 'destination_field', source_field_code: 'amazon_image_5', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 150 },
  { attribute_code: 'image_6', attribute_label: 'Image 6', source_mode: 'destination_field', source_field_code: 'amazon_image_6', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 160 },
  { attribute_code: 'image_7', attribute_label: 'Image 7', source_mode: 'destination_field', source_field_code: 'amazon_image_7', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 170 },
  { attribute_code: 'image_8', attribute_label: 'Image 8', source_mode: 'destination_field', source_field_code: 'amazon_image_8', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 180 },
];

const SHOPIFY_ATTRIBUTE_MAPPINGS: TemplateAttributeMapping[] = [
  { attribute_code: 'title', attribute_label: 'Title', source_mode: 'shared_field', source_field_code: 'title', override_field_code: 'shopify_title', resolution_rule: 'destination_override_then_base', is_required: true, max_length: 255, notes: null, sort_order: 10 },
  { attribute_code: 'body_html', attribute_label: 'Body HTML', source_mode: 'shared_field', source_field_code: 'long_description', override_field_code: 'shopify_body_html', resolution_rule: 'destination_override_then_base', is_required: true, max_length: null, notes: 'Uses Shopify HTML body when present.', sort_order: 20 },
  { attribute_code: 'vendor', attribute_label: 'Vendor', source_mode: 'shared_field', source_field_code: 'brand_name', override_field_code: 'shopify_vendor', resolution_rule: 'destination_override_then_base', is_required: false, max_length: 255, notes: null, sort_order: 30 },
  { attribute_code: 'product_type', attribute_label: 'Product Type', source_mode: 'destination_field', source_field_code: 'shopify_product_type', resolution_rule: 'destination_only', is_required: false, max_length: 255, notes: null, sort_order: 40 },
  { attribute_code: 'tags', attribute_label: 'Tags', source_mode: 'destination_field', source_field_code: 'shopify_tags', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 50 },
  { attribute_code: 'seo_title', attribute_label: 'SEO Title', source_mode: 'destination_field', source_field_code: 'shopify_seo_title', resolution_rule: 'destination_only', is_required: false, max_length: 70, notes: null, sort_order: 60 },
  { attribute_code: 'seo_description', attribute_label: 'SEO Description', source_mode: 'destination_field', source_field_code: 'shopify_seo_description', resolution_rule: 'destination_only', is_required: false, max_length: 320, notes: null, sort_order: 70 },
  { attribute_code: 'handle', attribute_label: 'Handle', source_mode: 'destination_field', source_field_code: 'shopify_handle', resolution_rule: 'destination_only', is_required: false, max_length: 255, notes: null, sort_order: 80 },
  { attribute_code: 'featured_image', attribute_label: 'Featured Image', source_mode: 'destination_field', source_field_code: 'shopify_featured_image', resolution_rule: 'destination_only', is_required: true, max_length: null, notes: null, sort_order: 90 },
  { attribute_code: 'image_2', attribute_label: 'Image 2', source_mode: 'destination_field', source_field_code: 'shopify_image_2', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 100 },
  { attribute_code: 'image_3', attribute_label: 'Image 3', source_mode: 'destination_field', source_field_code: 'shopify_image_3', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 110 },
  { attribute_code: 'image_4', attribute_label: 'Image 4', source_mode: 'destination_field', source_field_code: 'shopify_image_4', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 120 },
  { attribute_code: 'image_5', attribute_label: 'Image 5', source_mode: 'destination_field', source_field_code: 'shopify_image_5', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 130 },
];

const PORTAL_ATTRIBUTE_MAPPINGS: TemplateAttributeMapping[] = [
  { attribute_code: 'title', attribute_label: 'Title', source_mode: 'shared_field', source_field_code: 'title', override_field_code: 'portal_title', resolution_rule: 'destination_override_then_base', is_required: true, max_length: 255, notes: null, sort_order: 10 },
  { attribute_code: 'short_description', attribute_label: 'Short Description', source_mode: 'shared_field', source_field_code: 'short_description', override_field_code: 'portal_short_description', resolution_rule: 'destination_override_then_base', is_required: true, max_length: 500, notes: null, sort_order: 20 },
  { attribute_code: 'description', attribute_label: 'Description', source_mode: 'shared_field', source_field_code: 'long_description', override_field_code: 'portal_description', resolution_rule: 'destination_override_then_base', is_required: false, max_length: null, notes: null, sort_order: 30 },
  { attribute_code: 'brand', attribute_label: 'Brand', source_mode: 'shared_field', source_field_code: 'brand_name', override_field_code: 'portal_brand', resolution_rule: 'destination_override_then_base', is_required: false, max_length: 100, notes: null, sort_order: 40 },
  { attribute_code: 'category', attribute_label: 'Category', source_mode: 'destination_field', source_field_code: 'portal_category', resolution_rule: 'destination_only', is_required: false, max_length: 255, notes: null, sort_order: 50 },
  { attribute_code: 'upc', attribute_label: 'UPC / Barcode', source_mode: 'shared_field', source_field_code: 'barcode', override_field_code: 'portal_upc', resolution_rule: 'destination_override_then_base', is_required: false, max_length: 14, notes: null, sort_order: 60 },
  { attribute_code: 'hero_image', attribute_label: 'Hero Image', source_mode: 'destination_field', source_field_code: 'portal_hero_image', resolution_rule: 'destination_only', is_required: true, max_length: null, notes: null, sort_order: 70 },
  { attribute_code: 'lifestyle_image_1', attribute_label: 'Lifestyle Image 1', source_mode: 'destination_field', source_field_code: 'portal_lifestyle_image_1', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 80 },
  { attribute_code: 'lifestyle_image_2', attribute_label: 'Lifestyle Image 2', source_mode: 'destination_field', source_field_code: 'portal_lifestyle_image_2', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 90 },
  { attribute_code: 'lifestyle_image_3', attribute_label: 'Lifestyle Image 3', source_mode: 'destination_field', source_field_code: 'portal_lifestyle_image_3', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 100 },
  { attribute_code: 'label_front', attribute_label: 'Label Front', source_mode: 'destination_field', source_field_code: 'portal_label_front', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 110 },
  { attribute_code: 'label_back', attribute_label: 'Label Back', source_mode: 'destination_field', source_field_code: 'portal_label_back', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 120 },
  { attribute_code: 'sell_sheet', attribute_label: 'Sell Sheet', source_mode: 'destination_field', source_field_code: 'portal_sell_sheet', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 130 },
  { attribute_code: 'spec_sheet', attribute_label: 'Spec Sheet', source_mode: 'destination_field', source_field_code: 'portal_spec_sheet', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 140 },
];

const MERCADO_LIBRE_ATTRIBUTE_MAPPINGS: TemplateAttributeMapping[] = [
  { attribute_code: 'title', attribute_label: 'Title', source_mode: 'shared_field', source_field_code: 'title', override_field_code: 'meli_title', resolution_rule: 'destination_override_then_base', is_required: true, max_length: 60, notes: null, sort_order: 10 },
  { attribute_code: 'description', attribute_label: 'Description', source_mode: 'shared_field', source_field_code: 'long_description', override_field_code: 'meli_description', resolution_rule: 'destination_override_then_base', is_required: true, max_length: 50000, notes: null, sort_order: 20 },
  { attribute_code: 'brand', attribute_label: 'Brand', source_mode: 'shared_field', source_field_code: 'brand_name', override_field_code: 'meli_brand', resolution_rule: 'destination_override_then_base', is_required: true, max_length: 100, notes: null, sort_order: 30 },
  { attribute_code: 'condition', attribute_label: 'Condition', source_mode: 'destination_field', source_field_code: 'meli_condition', resolution_rule: 'destination_only', is_required: true, max_length: null, notes: null, sort_order: 40 },
  { attribute_code: 'listing_type_id', attribute_label: 'Listing Type', source_mode: 'destination_field', source_field_code: 'meli_listing_type_id', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 50 },
  { attribute_code: 'category_id', attribute_label: 'Category ID', source_mode: 'destination_field', source_field_code: 'meli_category_id', resolution_rule: 'destination_only', is_required: false, max_length: 20, notes: null, sort_order: 60 },
  { attribute_code: 'warranty', attribute_label: 'Warranty', source_mode: 'destination_field', source_field_code: 'meli_warranty', resolution_rule: 'destination_only', is_required: false, max_length: 255, notes: null, sort_order: 70 },
  { attribute_code: 'video_id', attribute_label: 'YouTube Video ID', source_mode: 'destination_field', source_field_code: 'meli_video_id', resolution_rule: 'destination_only', is_required: false, max_length: 11, notes: null, sort_order: 80 },
  { attribute_code: 'main_image', attribute_label: 'Main Image', source_mode: 'destination_field', source_field_code: 'meli_image_1', resolution_rule: 'destination_only', is_required: true, max_length: null, notes: null, sort_order: 90 },
  { attribute_code: 'image_2', attribute_label: 'Image 2', source_mode: 'destination_field', source_field_code: 'meli_image_2', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 100 },
  { attribute_code: 'image_3', attribute_label: 'Image 3', source_mode: 'destination_field', source_field_code: 'meli_image_3', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 110 },
  { attribute_code: 'image_4', attribute_label: 'Image 4', source_mode: 'destination_field', source_field_code: 'meli_image_4', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 120 },
  { attribute_code: 'image_5', attribute_label: 'Image 5', source_mode: 'destination_field', source_field_code: 'meli_image_5', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 130 },
  { attribute_code: 'image_6', attribute_label: 'Image 6', source_mode: 'destination_field', source_field_code: 'meli_image_6', resolution_rule: 'destination_only', is_required: false, max_length: null, notes: null, sort_order: 140 },
];

const EXCEL_RULES: TemplateFieldRule[] = [
  { field_code: 'title', is_required: true, max_length: 255, notes: 'Exported as the main title column.' },
  { field_code: 'sku', is_required: true, max_length: 255, notes: 'Exported as SKU.' },
  { field_code: 'scin', is_required: true, max_length: 255, notes: 'Exported as SCIN.' },
  { field_code: 'barcode', is_required: false, max_length: 255, notes: 'Exported when present.' },
  { field_code: 'brand_name', is_required: false, max_length: 255, notes: 'Exported when present.' },
  { field_code: 'long_description', is_required: false, max_length: null, notes: 'Plain-text product description.' },
];

const EXCEL_ATTRIBUTE_MAPPINGS: TemplateAttributeMapping[] = [
  { attribute_code: 'title', attribute_label: 'Title', source_mode: 'shared_field', source_field_code: 'title', resolution_rule: 'base_only', is_required: true, max_length: 255, notes: null, sort_order: 10 },
  { attribute_code: 'sku', attribute_label: 'SKU', source_mode: 'shared_field', source_field_code: 'sku', resolution_rule: 'base_only', is_required: true, max_length: 255, notes: null, sort_order: 20 },
  { attribute_code: 'scin', attribute_label: 'SCIN', source_mode: 'shared_field', source_field_code: 'scin', resolution_rule: 'base_only', is_required: true, max_length: 255, notes: null, sort_order: 30 },
  { attribute_code: 'barcode', attribute_label: 'Barcode', source_mode: 'shared_field', source_field_code: 'barcode', resolution_rule: 'base_only', is_required: false, max_length: 255, notes: null, sort_order: 40 },
  { attribute_code: 'brand', attribute_label: 'Brand', source_mode: 'shared_field', source_field_code: 'brand_name', resolution_rule: 'base_only', is_required: false, max_length: 255, notes: null, sort_order: 50 },
  { attribute_code: 'description', attribute_label: 'Description', source_mode: 'shared_field', source_field_code: 'long_description', resolution_rule: 'base_only', is_required: false, max_length: null, notes: null, sort_order: 60 },
];

// ─── Template registry ────────────────────────────────────────────────────────

export const OUTPUT_PROFILE_TEMPLATES: OutputProfileTemplate[] = [
  /* {
    key: 'amazon',
    name: 'Amazon',
    description: 'Standard Amazon Seller Central listing fields — title, bullets, description, and backend keywords.',
    profile_type: 'marketplace',
    group_code: 'amazon',
    group_name: 'Amazon',
    group_description: 'Amazon Seller Central listing content — title, feature bullets, description, and search keywords.',
    fields: AMAZON_FIELDS,
    field_rules: AMAZON_RULES,
    attribute_mappings: AMAZON_ATTRIBUTE_MAPPINGS,
  }, */
  {
    key: 'ecommerce-catalog',
    name: 'Ecommerce Catalog',
    description: 'Shopify storefront fields — HTML description, vendor, product type, SEO title and meta description.',
    profile_type: 'api',
    group_code: 'ecommerce_catalog',
    group_name: 'Ecommerce Catalog',
    group_description: 'Shopify storefront listing content — title, HTML description, SEO fields, and URL handle.',
    fields: SHOPIFY_FIELDS,
    field_rules: SHOPIFY_RULES,
    attribute_mappings: SHOPIFY_ATTRIBUTE_MAPPINGS,
  },
  /* {
    key: 'walmart',
    name: 'Walmart',
    description: 'Walmart Marketplace listing fields — product name, short and long descriptions, and key feature bullets.',
    profile_type: 'marketplace',
    group_code: 'walmart',
    group_name: 'Walmart',
    group_description: 'Walmart Marketplace listing content — title, descriptions, and key feature bullets.',
    fields: WALMART_FIELDS,
    field_rules: WALMART_RULES,
  }, */
  {
    key: 'portal-catalog',
    name: 'Portal Catalog',
    description: 'Core fields for a branded retailer or distributor portal — title, short description, full description, brand, and category.',
    profile_type: 'portal',
    group_code: 'partner_portal',
    group_name: 'Partner Portal',
    group_description: 'Retail and distributor portal content — title, descriptions, brand, and category.',
    fields: PORTAL_FIELDS,
    field_rules: PORTAL_RULES,
    attribute_mappings: PORTAL_ATTRIBUTE_MAPPINGS,
  },
  /* {
    key: 'mercado_libre',
    name: 'Mercado Libre',
    description: 'Mercado Libre listing fields — strict 60-char title, plain-text description, condition, listing type, and ML category ID.',
    profile_type: 'marketplace',
    group_code: 'mercado_libre',
    group_name: 'Mercado Libre',
    group_description: 'Mercado Libre listing content — title (max 60 chars), description, condition, and category.',
    fields: MERCADO_LIBRE_FIELDS,
    field_rules: MERCADO_LIBRE_RULES,
    attribute_mappings: MERCADO_LIBRE_ATTRIBUTE_MAPPINGS,
  }, */
  {
    key: 'excel_export',
    name: 'Excel Export',
    description: 'Reusable Excel export columns for bulk review, partner handoff, and downstream editing.',
    profile_type: 'export',
    group_code: 'excel_export',
    group_name: 'Excel Export',
    group_description: 'Excel export definition for bulk product review and partner handoff.',
    fields: [],
    field_rules: EXCEL_RULES,
    attribute_mappings: EXCEL_ATTRIBUTE_MAPPINGS,
  },
];

const OUTPUT_PROFILE_TEMPLATE_ALIASES: Record<string, string> = {
  portal: 'portal-catalog',
  generic_portal: 'portal-catalog',
  shopify: 'ecommerce-catalog',
};

/** Look up a template by key. Returns undefined if not found. */
export function getOutputProfileTemplate(key: string): OutputProfileTemplate | undefined {
  const resolvedKey = OUTPUT_PROFILE_TEMPLATE_ALIASES[key] ?? key;
  return OUTPUT_PROFILE_TEMPLATES.find((t) => t.key === resolvedKey);
}

/** Returns the template keys that match a given profile_type (e.g. all 'marketplace' templates). */
export function getTemplatesByProfileType(
  profileType: OutputProfileTemplate['profile_type']
): OutputProfileTemplate[] {
  return OUTPUT_PROFILE_TEMPLATES.filter((t) => t.profile_type === profileType);
}
