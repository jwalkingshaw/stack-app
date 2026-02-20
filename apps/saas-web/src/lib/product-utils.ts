/**
 * Product utilities for URL handling and slug generation
 */

/**
 * Generate a URL-friendly slug from a product SKU
 * @param sku - Product SKU
 * @returns URL-safe slug
 */
export function generateProductSlug(sku: string): string {
  if (!sku) return '';

  return sku
    .toLowerCase()
    .replace(/[^\w\-]/g, '-') // Replace non-word chars with hyphens
    .replace(/--+/g, '-')     // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
}

/**
 * Parse product identifier from URL (could be slug or UUID)
 * @param identifier - URL identifier (slug or UUID)
 * @returns Object with parsing info
 */
export function parseProductIdentifier(identifier: string) {
  // UUID pattern (8-4-4-4-12 format)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const isUuid = uuidPattern.test(identifier);
  const isSlug = !isUuid && identifier.length > 0;

  return {
    identifier,
    isUuid,
    isSlug,
    type: isUuid ? 'uuid' : isSlug ? 'slug' : 'unknown'
  };
}

/**
 * Generate product URL using SKU-based approach
 * @param tenantSlug - Organization slug
 * @param sku - Product SKU
 * @param productId - Product UUID (fallback)
 * @returns Product URL
 */
export function generateProductUrl(
  tenantSlug: string,
  sku?: string | null,
  productId?: string
): string {
  // Prefer immutable IDs for routing consistency across scoped views.
  if (productId) {
    return `/${tenantSlug}/products/${productId}`;
  }

  if (sku) {
    const slug = generateProductSlug(sku);
    return `/${tenantSlug}/products/${slug}`;
  }

  throw new Error('Either SKU or productId must be provided');
}

/**
 * Generate variant URL
 * @param tenantSlug - Organization slug
 * @param parentSku - Parent product SKU
 * @param variantSku - Variant SKU
 * @returns Variant URL
 */
export function generateVariantUrl(tenantSlug: string, parentSku: string, variantSku: string): string {
  const parentIdentifier = parseProductIdentifier(parentSku);
  const variantIdentifier = parseProductIdentifier(variantSku);
  const parentSlug = parentIdentifier.isUuid ? parentSku : generateProductSlug(parentSku);
  const variantSlug = variantIdentifier.isUuid ? variantSku : generateProductSlug(variantSku);
  return `/${tenantSlug}/products/${parentSlug}/variants/${variantSlug}`;
}

/**
 * Get the appropriate URL for any product based on its type
 * @param product - Product data
 * @param tenantSlug - Organization slug
 * @returns Appropriate URL for the product
 */
export function getProductUrl(product: any, tenantSlug: string): string {
  if (product.type === 'variant' && (product.parent_sku || product.parent_id)) {
    return generateVariantUrl(
      tenantSlug,
      product.parent_sku || product.parent_id,
      product.sku || product.id
    );
  }

  return generateProductUrl(tenantSlug, product.sku, product.id);
}

/**
 * Convert database product data to URL-friendly format
 * @param product - Product data from database
 * @param tenantSlug - Organization slug
 * @returns URL and identifier info
 */
export function getProductUrlInfo(product: any, tenantSlug: string) {
  const url = getProductUrl(product, tenantSlug);
  const slug = generateProductSlug(product.sku);

  return {
    url,
    slug,
    uuid: product.id,
    sku: product.sku,
    type: product.type,
    isVariant: product.type === 'variant',
    parentSku: product.parent_sku
  };
}

/**
 * Product hierarchy utilities
 */
export const ProductHierarchy = {
  /**
   * Check if a product should redirect to its parent
   */
  shouldRedirectToParent(product: any): boolean {
    return product.type === 'variant' && product.parent_id;
  },

  /**
   * Get the canonical URL for a product (considering hierarchy)
   */
  getCanonicalUrl(product: any, tenantSlug: string): string {
    return getProductUrl(product, tenantSlug);
  },

  /**
   * Parse variant URL to extract parent and variant SKUs
   */
  parseVariantUrl(pathname: string): { parentSlug: string; variantSlug: string } | null {
    const match = pathname.match(/\/products\/([^\/]+)\/variants\/([^\/]+)/);
    if (match) {
      return {
        parentSlug: match[1],
        variantSlug: match[2]
      };
    }
    return null;
  },

  /**
   * Check if URL is a variant URL
   */
  isVariantUrl(pathname: string): boolean {
    return pathname.includes('/variants/');
  }
};
