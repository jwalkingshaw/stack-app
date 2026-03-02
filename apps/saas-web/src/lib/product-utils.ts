/**
 * Product utilities for URL handling and slug generation
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;

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
  const normalized = (identifier || "").trim();
  const uuidPrefixMatch = normalized.match(UUID_PREFIX_PATTERN);
  const isUuid = UUID_PATTERN.test(normalized) || Boolean(uuidPrefixMatch?.[1]);
  const isSlug = !isUuid && identifier.length > 0;
  const uuid = uuidPrefixMatch?.[1] || (UUID_PATTERN.test(normalized) ? normalized : null);

  return {
    identifier,
    normalized,
    uuid,
    isUuid,
    isSlug,
    type: isUuid ? 'uuid' : isSlug ? 'slug' : 'unknown'
  };
}

export function buildCanonicalProductIdentifier(
  identifier: string,
  label?: string | null
): string {
  const parsed = parseProductIdentifier(identifier);
  if (parsed.isUuid && parsed.uuid) {
    const normalizedLabel = (label || "").trim();
    const slug = normalizedLabel ? generateProductSlug(normalizedLabel) : "";
    if (!slug || slug.toLowerCase() === parsed.uuid.toLowerCase()) {
      return parsed.uuid;
    }
    return `${parsed.uuid}-${slug}`;
  }

  return generateProductSlug(identifier);
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
  label?: string | null,
  productId?: string
): string {
  // Prefer immutable IDs for routing consistency across scoped views.
  if (productId) {
    return `/${tenantSlug}/products/${buildCanonicalProductIdentifier(productId, label)}`;
  }

  if (label) {
    const slug = generateProductSlug(label);
    return `/${tenantSlug}/products/${slug}`;
  }

  throw new Error('Either label or productId must be provided');
}

/**
 * Generate variant URL
 * @param tenantSlug - Organization slug
 * @param parentSku - Parent product SKU
 * @param variantSku - Variant SKU
 * @returns Variant URL
 */
export function generateVariantUrl(
  tenantSlug: string,
  parentIdentifier: string,
  variantIdentifier: string,
  options?: { parentLabel?: string | null; variantLabel?: string | null }
): string {
  const parentSegment = buildCanonicalProductIdentifier(
    parentIdentifier,
    options?.parentLabel
  );
  const variantSegment = buildCanonicalProductIdentifier(
    variantIdentifier,
    options?.variantLabel
  );
  return `/${tenantSlug}/products/${parentSegment}/variants/${variantSegment}`;
}

/**
 * Get the appropriate URL for any product based on its type
 * @param product - Product data
 * @param tenantSlug - Organization slug
 * @returns Appropriate URL for the product
 */
export function getProductUrl(product: any, tenantSlug: string): string {
  const parentIdentifier =
    product.parent_id ||
    product.parentId ||
    product.parent_product?.id ||
    product.parent_sku ||
    product.parentSku ||
    null;

  if (product.type === 'variant' && parentIdentifier) {
    return generateVariantUrl(
      tenantSlug,
      parentIdentifier,
      product.id || product.sku,
      {
        parentLabel:
          product.parent_product_name ||
          product.parentProductName ||
          product.parent_product?.product_name ||
          product.parent_sku ||
          product.parentSku ||
          null,
        variantLabel: product.product_name || product.title || product.sku || null,
      }
    );
  }

  return generateProductUrl(
    tenantSlug,
    product.product_name || product.title || product.sku,
    product.id
  );
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
