/**
 * Product Linking Intelligence System
 * Handles SKU detection, auto-linking, and confidence scoring for asset-product relationships
 */

export interface ProductLinkSuggestion {
  productId: string;
  sku: string;
  productName: string;
  confidence: number;
  matchReason: string;
  linkContext: string;
}

export interface SkuPattern {
  pattern: RegExp;
  extractSku: (match: RegExpMatchArray) => string;
  confidence: number;
}

// Common SKU patterns for nutrition brands
const SKU_PATTERNS: SkuPattern[] = [
  // Direct SKU matches: WPI-VAN-2LB, CRTN-MONO-500G
  {
    pattern: /([A-Z]{2,4}-[A-Z]{2,4}-[A-Z0-9]+)/gi,
    extractSku: (match) => match[1],
    confidence: 0.95
  },
  // Product code with size: WPI_VAN_2LB, CREATINE_500G
  {
    pattern: /([A-Z]+_[A-Z]+_[A-Z0-9]+)/gi,
    extractSku: (match) => match[1].replace(/_/g, '-'),
    confidence: 0.85
  },
  // Brand-Product-Size: NUTRIMAX-WHEY-2LB
  {
    pattern: /([A-Z]+-[A-Z]+-[A-Z0-9]+)/gi,
    extractSku: (match) => match[1],
    confidence: 0.90
  },
  // Simple product codes: WPI001, CRTN500
  {
    pattern: /([A-Z]{3,6}[0-9]{3,6})/gi,
    extractSku: (match) => match[1],
    confidence: 0.70
  }
];

// Asset type detection based on filename patterns
const ASSET_TYPE_PATTERNS = [
  { pattern: /front|hero|main/i, type: 'Primary Image', context: 'Product Hero', confidence: 0.9 },
  { pattern: /back|rear|label/i, type: 'Product Label', context: 'E-commerce', confidence: 0.85 },
  { pattern: /ingredients|supplement[_-]facts|nutrition[_-]facts/i, type: 'Supplement Facts', context: 'Compliance', confidence: 0.95 },
  { pattern: /lifestyle|gym|workout|fitness/i, type: 'Lifestyle Photo', context: 'Marketing', confidence: 0.80 },
  { pattern: /social|instagram|facebook|twitter/i, type: 'Social Media', context: 'Social Media', confidence: 0.85 },
  { pattern: /banner|ad|advertisement/i, type: 'Marketing Asset', context: 'Advertising', confidence: 0.80 },
  { pattern: /package|packaging|box/i, type: 'Packaging', context: 'E-commerce', confidence: 0.85 },
  { pattern: /texture|swatch|powder/i, type: 'Product Texture', context: 'Marketing', confidence: 0.75 }
];

/**
 * Extract potential SKUs from filename
 */
export function extractSkusFromFilename(filename: string): Array<{sku: string, confidence: number}> {
  const skus: Array<{sku: string, confidence: number}> = [];
  
  for (const pattern of SKU_PATTERNS) {
    const matches = filename.matchAll(pattern.pattern);
    for (const match of matches) {
      const sku = pattern.extractSku(match);
      if (sku && sku.length >= 6) { // Minimum SKU length
        skus.push({
          sku: sku.toUpperCase(),
          confidence: pattern.confidence
        });
      }
    }
  }
  
  // Remove duplicates, keeping highest confidence
  const uniqueSkus = new Map<string, number>();
  skus.forEach(({sku, confidence}) => {
    if (!uniqueSkus.has(sku) || uniqueSkus.get(sku)! < confidence) {
      uniqueSkus.set(sku, confidence);
    }
  });
  
  return Array.from(uniqueSkus.entries()).map(([sku, confidence]) => ({sku, confidence}));
}

/**
 * Detect asset type and context from filename
 */
export function detectAssetType(filename: string): {
  assetType: string;
  linkContext: string;
  confidence: number;
} {
  for (const pattern of ASSET_TYPE_PATTERNS) {
    if (pattern.pattern.test(filename)) {
      return {
        assetType: pattern.type,
        linkContext: pattern.context,
        confidence: pattern.confidence
      };
    }
  }
  
  // Default fallback
  return {
    assetType: 'Marketing Asset',
    linkContext: 'General',
    confidence: 0.5
  };
}

/**
 * Generate product link suggestions based on filename and available products
 */
export function generateProductLinkSuggestions(
  filename: string,
  availableProducts: Array<{id: string, sku: string, productName: string, brand: string}>
): ProductLinkSuggestion[] {
  const suggestions: ProductLinkSuggestion[] = [];
  
  // Extract potential SKUs from filename
  const detectedSkus = extractSkusFromFilename(filename);
  
  // Detect asset type for context
  const assetTypeInfo = detectAssetType(filename);
  
  // Match against available products
  for (const {sku, confidence: skuConfidence} of detectedSkus) {
    const matchingProducts = availableProducts.filter(product => 
      product.sku.toUpperCase() === sku ||
      product.sku.toUpperCase().includes(sku) ||
      sku.includes(product.sku.toUpperCase())
    );
    
    for (const product of matchingProducts) {
      const exactMatch = product.sku.toUpperCase() === sku;
      const finalConfidence = exactMatch ? skuConfidence : skuConfidence * 0.8;
      
      suggestions.push({
        productId: product.id,
        sku: product.sku,
        productName: product.productName,
        confidence: Math.min(finalConfidence * assetTypeInfo.confidence, 1.0),
        matchReason: exactMatch ? 'Exact SKU match' : 'Partial SKU match',
        linkContext: assetTypeInfo.linkContext
      });
    }
  }
  
  // Brand-based suggestions (lower confidence)
  const brandMatches = availableProducts.filter(product =>
    filename.toLowerCase().includes(product.brand.toLowerCase()) ||
    filename.toLowerCase().includes(product.productName.toLowerCase())
  );
  
  for (const product of brandMatches) {
    // Avoid duplicates from SKU matches
    if (!suggestions.find(s => s.productId === product.id)) {
      suggestions.push({
        productId: product.id,
        sku: product.sku,
        productName: product.productName,
        confidence: 0.6 * assetTypeInfo.confidence,
        matchReason: 'Brand/product name match',
        linkContext: assetTypeInfo.linkContext
      });
    }
  }
  
  // Sort by confidence (highest first) and limit results
  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5); // Top 5 suggestions
}

/**
 * Validate a product link and calculate confidence score
 */
export function validateProductLink(
  assetFilename: string,
  productSku: string,
  productName: string,
  linkContext: string
): {
  isValid: boolean;
  confidence: number;
  validationReasons: string[];
} {
  const reasons: string[] = [];
  let confidence = 0.5; // Base confidence
  
  // Check for SKU match
  const detectedSkus = extractSkusFromFilename(assetFilename);
  const skuMatch = detectedSkus.find(({sku}) => 
    sku === productSku.toUpperCase() || productSku.toUpperCase().includes(sku)
  );
  
  if (skuMatch) {
    confidence = Math.max(confidence, skuMatch.confidence);
    reasons.push(`SKU detected in filename: ${skuMatch.sku}`);
  }
  
  // Check for product name match
  const productWords = productName.toLowerCase().split(/\s+/);
  const filenameWords = assetFilename.toLowerCase().split(/[_\-\s.]+/);
  const wordMatches = productWords.filter(word => 
    word.length > 3 && filenameWords.some(fw => fw.includes(word))
  );
  
  if (wordMatches.length > 0) {
    confidence += wordMatches.length * 0.1;
    reasons.push(`Product name keywords found: ${wordMatches.join(', ')}`);
  }
  
  // Context validation
  const assetTypeInfo = detectAssetType(assetFilename);
  if (assetTypeInfo.linkContext === linkContext) {
    confidence += 0.1;
    reasons.push(`Asset type matches context: ${assetTypeInfo.assetType}`);
  }
  
  return {
    isValid: confidence > 0.6,
    confidence: Math.min(confidence, 1.0),
    validationReasons: reasons
  };
}