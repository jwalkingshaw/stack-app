/**
 * Barcode validation utilities based on international standards
 * Supports UPC, EAN, GTIN formats with length and checksum validation
 */

export interface BarcodeValidationResult {
  isValid: boolean;
  type: 'UPC-E' | 'UPC-A' | 'EAN-13' | 'GTIN-14' | 'UNKNOWN';
  error?: string;
}

/**
 * Validate barcode format and checksum
 * Following Akeneo PIM 2025 validation standards
 */
export function validateBarcode(barcode: string): BarcodeValidationResult {
  if (!barcode || typeof barcode !== 'string') {
    return { isValid: false, type: 'UNKNOWN', error: 'Barcode is required' };
  }

  // Remove any spaces or dashes
  const cleanBarcode = barcode.replace(/[\s-]/g, '');

  // Check if it's all digits
  if (!/^\d+$/.test(cleanBarcode)) {
    return { isValid: false, type: 'UNKNOWN', error: 'Barcode must contain only digits' };
  }

  const length = cleanBarcode.length;

  // Validate length (following Akeneo standards: 8, 12, 13, or 14 digits)
  if (![8, 12, 13, 14].includes(length)) {
    return {
      isValid: false,
      type: 'UNKNOWN',
      error: 'Barcode must be 8, 12, 13, or 14 digits long'
    };
  }

  // Determine type based on length
  let type: BarcodeValidationResult['type'];
  switch (length) {
    case 8:
      type = 'UPC-E';
      break;
    case 12:
      type = 'UPC-A';
      break;
    case 13:
      type = 'EAN-13';
      break;
    case 14:
      type = 'GTIN-14';
      break;
    default:
      type = 'UNKNOWN';
  }

  // Validate checksum using GS1 algorithm
  const isValidChecksum = validateGS1Checksum(cleanBarcode);

  if (!isValidChecksum) {
    return {
      isValid: false,
      type,
      error: `Invalid ${type} checksum`
    };
  }

  return { isValid: true, type };
}

/**
 * Validate GS1 checksum digit
 * Used for UPC, EAN, and GTIN validation
 */
function validateGS1Checksum(barcode: string): boolean {
  const digits = barcode.split('').map(Number);
  const checkDigit = digits.pop()!;

  let sum = 0;
  let isOdd = true;

  // Calculate checksum from right to left (excluding check digit)
  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = digits[i];
    sum += isOdd ? digit * 3 : digit;
    isOdd = !isOdd;
  }

  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  return calculatedCheckDigit === checkDigit;
}

/**
 * Format barcode for display with proper spacing
 */
export function formatBarcode(barcode: string): string {
  if (!barcode) return '';

  const clean = barcode.replace(/[\s-]/g, '');
  const validation = validateBarcode(clean);

  if (!validation.isValid) return barcode;

  // Format based on type
  switch (validation.type) {
    case 'UPC-E':
      // Format as 0-XXXXXX-X
      return `${clean.slice(0, 1)}-${clean.slice(1, 7)}-${clean.slice(7)}`;
    case 'UPC-A':
      // Format as X-XXXXX-XXXXX-X
      return `${clean.slice(0, 1)}-${clean.slice(1, 6)}-${clean.slice(6, 11)}-${clean.slice(11)}`;
    case 'EAN-13':
      // Format as X-XXXXXX-XXXXXX-X
      return `${clean.slice(0, 1)}-${clean.slice(1, 7)}-${clean.slice(7, 12)}-${clean.slice(12)}`;
    case 'GTIN-14':
      // Format as XX-XXXXXX-XXXXXX-X
      return `${clean.slice(0, 2)}-${clean.slice(2, 8)}-${clean.slice(8, 13)}-${clean.slice(13)}`;
    default:
      return clean;
  }
}

/**
 * Get barcode type description
 */
export function getBarcodeTypeDescription(type: BarcodeValidationResult['type']): string {
  switch (type) {
    case 'UPC-E':
      return 'UPC-E (8 digits) - Used in North America for small products';
    case 'UPC-A':
      return 'UPC-A (12 digits) - Standard barcode for North America';
    case 'EAN-13':
      return 'EAN-13 (13 digits) - International standard barcode';
    case 'GTIN-14':
      return 'GTIN-14 (14 digits) - Global Trade Item Number for cases/pallets';
    default:
      return 'Unknown barcode format';
  }
}