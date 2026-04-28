import type { Json } from "@stack-app/database";

export type ImportIntent = "update_only" | "create_only" | "both";
export type TemplateSource = "family" | "channel";
export type ImportJobStatus =
  | "queued"
  | "uploaded"
  | "validating"
  | "ready"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";
export type ImportRowStatus = "pending" | "valid" | "invalid" | "applied" | "failed" | "skipped";

export type ImportScope = {
  marketId: string | null;
  channelId: string | null;
  localeId: string | null;
  destinationId: string | null;
};

export type TemplateFieldDefinition = {
  code: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  isAssetField?: boolean;
  source: "system" | "family" | "channel";
};

export type ParsedImportCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

export type ImportDisposition =
  | { kind: "update"; targetProductId: string }
  | { kind: "create" }
  | { kind: "delete"; targetProductId: string }
  | { kind: "invalid"; reason: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSET_REF_RE = /^AST-\d{1,}$/i;

export const DEFAULT_TEMPLATE_FIELDS: TemplateFieldDefinition[] = [
  { code: "action", label: "Action", fieldType: "select", isRequired: false, source: "system" },
  { code: "scin", label: "SCIN", fieldType: "identifier", isRequired: false, source: "system" },
  { code: "sku", label: "SKU", fieldType: "identifier", isRequired: false, source: "system" },
  { code: "product_name", label: "Product Name", fieldType: "text", isRequired: true, source: "system" },
  { code: "status", label: "Status", fieldType: "select", isRequired: false, source: "system" },
  { code: "barcode", label: "Barcode", fieldType: "identifier", isRequired: false, source: "system" },
  { code: "brand_line", label: "Brand Line", fieldType: "text", isRequired: false, source: "system" },
  { code: "short_description", label: "Short Description", fieldType: "textarea", isRequired: false, source: "system" },
  { code: "long_description", label: "Long Description", fieldType: "textarea", isRequired: false, source: "system" },
  { code: "features", label: "Features", fieldType: "multiselect", isRequired: false, source: "system" },
  { code: "meta_title", label: "Meta Title", fieldType: "text", isRequired: false, source: "system" },
  { code: "meta_description", label: "Meta Description", fieldType: "textarea", isRequired: false, source: "system" },
  { code: "keywords", label: "Keywords", fieldType: "multiselect", isRequired: false, source: "system" },
  { code: "weight_g", label: "Weight (g)", fieldType: "number", isRequired: false, source: "system" },
  { code: "parent_scin", label: "Parent SCIN", fieldType: "identifier", isRequired: false, source: "system" },
  { code: "family_code", label: "Family", fieldType: "identifier", isRequired: false, source: "system" },
];

const SYSTEM_ROW_FIELD_CODES = new Set([
  "product_name",
  "status",
  "barcode",
  "brand_line",
  "short_description",
  "long_description",
  "features",
  "meta_title",
  "meta_description",
  "keywords",
  "weight_g",
  "sku",
]);

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isUuidLike(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function parseAssetReferenceValue(value: unknown): { assetId: string | null; assetRef: string | null } {
  const token = normalizeOptionalString(value);
  if (!token) {
    return { assetId: null, assetRef: null };
  }

  if (isUuidLike(token)) {
    return { assetId: token, assetRef: null };
  }
  if (ASSET_REF_RE.test(token)) {
    return { assetId: null, assetRef: String(token).toUpperCase() };
  }
  return { assetId: null, assetRef: null };
}

export function formatTemplateHeader(label: string, code: string): string {
  return `${label} [${code}]`;
}

export function parseTemplateHeader(header: string): { label: string; code: string } {
  const trimmed = header.trim();
  const match = trimmed.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  if (!match) {
    return { label: trimmed, code: trimmed.toLowerCase().replace(/\s+/g, "_") };
  }
  return {
    label: match[1].trim(),
    code: match[2].trim().toLowerCase(),
  };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.replace(/\r/g, ""));
}

export function parseCsvText(text: string): ParsedImportCsv {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\n/);
  const records: string[] = [];
  let buffer = "";
  let quoteCount = 0;

  for (const rawLine of lines) {
    if (buffer.length > 0) {
      buffer += "\n";
    }
    buffer += rawLine;
    quoteCount += (rawLine.match(/"/g) || []).length;

    if (quoteCount % 2 === 1) {
      continue;
    }

    records.push(buffer);
    buffer = "";
    quoteCount = 0;
  }
  if (buffer.length > 0) {
    records.push(buffer);
  }

  const nonEmptyRecords = records.filter((line) => line.trim().length > 0);
  if (nonEmptyRecords.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(nonEmptyRecords[0]).map((header) => header.trim());
  const rows = nonEmptyRecords.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

export function toCsvValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) {
    return toCsvValue(value.join("; "));
  }
  const stringValue = typeof value === "string" ? value : JSON.stringify(value);
  if (/[,"\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(toCsvValue).join(",")];
  for (const row of rows) {
    lines.push(row.map(toCsvValue).join(","));
  }
  return lines.join("\r\n");
}

export function dedupeTemplateFields(fields: TemplateFieldDefinition[]): TemplateFieldDefinition[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const code = field.code.toLowerCase();
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

export function buildTemplateCsv(fields: TemplateFieldDefinition[]): string {
  const headers = fields.map((field) => formatTemplateHeader(field.label, field.code));
  return buildCsv(headers, []);
}

export function parseRowByCode(row: Record<string, string>): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const [header, value] of Object.entries(row)) {
    const { code } = parseTemplateHeader(header);
    parsed[code] = typeof value === "string" ? value.trim() : "";
  }
  return parsed;
}

export function hasCreatePayload(rowByCode: Record<string, string>, familyCodeFromJob: string | null): boolean {
  const productName = normalizeOptionalString(rowByCode.product_name);
  const familyCode = normalizeOptionalString(rowByCode.family_code) || familyCodeFromJob;
  return Boolean(productName && familyCode);
}

export function resolveImportDisposition(params: {
  intent: ImportIntent;
  action?: string | null;
  scin: string | null;
  sku: string | null;
  scinProductId: string | null;
  skuProductId: string | null;
  hasCreatePayload: boolean;
}): ImportDisposition {
  const { intent, scin, sku, scinProductId, skuProductId, hasCreatePayload } = params;
  const action = typeof params.action === "string" ? params.action.trim().toLowerCase() : "";

  if (action === "delete") {
    if (scin) {
      if (!scinProductId) {
        return { kind: "invalid", reason: "Delete row: SCIN did not match an existing product." };
      }
      return { kind: "delete", targetProductId: scinProductId };
    }
    if (sku) {
      if (!skuProductId) {
        return { kind: "invalid", reason: "Delete row: SKU did not match an existing product." };
      }
      return { kind: "delete", targetProductId: skuProductId };
    }
    return { kind: "invalid", reason: "Delete rows require SCIN or SKU to identify the product." };
  }

  if (action === "create" || intent === "create_only") {
    if (scin) {
      return { kind: "invalid", reason: "Create rows cannot include SCIN." };
    }
    if (sku && skuProductId) {
      return { kind: "invalid", reason: "Create rows cannot target an existing SKU." };
    }
    if (!hasCreatePayload) {
      return { kind: "invalid", reason: "Row is missing the fields required to create a product." };
    }
    return { kind: "create" };
  }

  if (scin) {
    if (!scinProductId) {
      return { kind: "invalid", reason: "SCIN did not match an existing product." };
    }
    if (sku && skuProductId && skuProductId !== scinProductId) {
      return { kind: "invalid", reason: "SCIN and SKU resolve to different products." };
    }
    return { kind: "update", targetProductId: scinProductId };
  }

  if (sku) {
    if (skuProductId) {
      return { kind: "update", targetProductId: skuProductId };
    }
    if (intent === "update_only") {
      return { kind: "invalid", reason: "SKU did not match an existing product." };
    }
    if (!hasCreatePayload) {
      return { kind: "invalid", reason: "Row is missing the fields required to create a product." };
    }
    return { kind: "create" };
  }

  if (intent === "update_only") {
    return { kind: "invalid", reason: "Update rows require SCIN or SKU." };
  }
  if (!hasCreatePayload) {
    return { kind: "invalid", reason: "Row is missing the fields required to create a product." };
  }
  return { kind: "create" };
}

export function fieldBelongsToProductRow(code: string): boolean {
  return SYSTEM_ROW_FIELD_CODES.has(code);
}

export function normalizeImportScope(value: unknown): ImportScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      marketId: null,
      channelId: null,
      localeId: null,
      destinationId: null,
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    marketId: normalizeOptionalString(raw.marketId),
    channelId: normalizeOptionalString(raw.channelId),
    localeId: normalizeOptionalString(raw.localeId),
    destinationId: normalizeOptionalString(raw.destinationId),
  };
}

export function scopeToSearchParams(scope: ImportScope): URLSearchParams {
  const params = new URLSearchParams();
  if (scope.marketId) params.set("marketId", scope.marketId);
  if (scope.channelId) params.set("channelId", scope.channelId);
  if (scope.localeId) params.set("localeId", scope.localeId);
  if (scope.destinationId) params.set("destinationId", scope.destinationId);
  return params;
}

export function toJsonObject(value: Record<string, unknown>): Json {
  return value as unknown as Json;
}
