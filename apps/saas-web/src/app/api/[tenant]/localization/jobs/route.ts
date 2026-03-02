import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { assertBillingCapacity, getOrganizationBillingLimits } from "@/lib/billing-policy";
import { improveTextWithDeepL, isDeepLConfigured, translateWithDeepL } from "@/lib/deepl";
import { incrementLocalizationUsage } from "@/lib/localization-metering";
import { isMissingLocalizationFoundationError, requireLocalizationAccess } from "../_shared";

type JobType = "translate" | "write_assist";
type JobStatus = "queued" | "running" | "review_required" | "completed" | "failed" | "cancelled";
type ItemStatus = "generated" | "failed";

type LocaleRow = {
  id: string;
  code: string;
  name: string;
};

type PreferredTone = "neutral" | "formal" | "informal" | "professional" | "friendly";

type ProductRow = {
  id: string;
  type: string | null;
  parent_id: string | null;
  product_name: string | null;
  short_description: string | null;
  long_description: string | null;
  features: unknown;
  meta_title: string | null;
  meta_description: string | null;
  created_by: string | null;
  last_modified_by: string | null;
};

type ProductFieldRow = {
  id: string;
  code: string;
  field_type: string | null;
  is_translatable: boolean | null;
  is_write_assist_enabled: boolean | null;
  is_active: boolean | null;
};

type ProductFieldValueRow = {
  product_id: string;
  product_field_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_datetime: string | null;
  value_json: unknown;
  market_id: string | null;
  channel_id: string | null;
  destination_id: string | null;
  locale_id: string | null;
};

type JobWorkItem = {
  productId: string;
  fieldCode: string;
  productFieldId: string | null;
  sourceText: string;
  targetLocaleId: string;
  targetLocaleCode: string;
  sourceLocaleCode: string;
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  targetMarketId: string | null;
  targetChannelId: string | null;
  targetDestinationId: string | null;
};

type GeneratedItem = {
  workItem: JobWorkItem;
  status: ItemStatus;
  suggestedText?: string;
  billedChars: number;
  errorMessage?: string;
  detectedSourceLanguage?: string;
};

type ExecutionMode = "sync" | "async";

const TRANSLATABLE_SYSTEM_FIELDS = [
  "product_name",
  "short_description",
  "long_description",
  "features",
  "meta_title",
  "meta_description",
] as const;

const MAX_PRODUCTS_PER_JOB = 100;
const MAX_TEXT_BATCH_SIZE = 40;
const TEXTUAL_PRODUCT_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "rich_text",
  "wysiwyg",
  "markdown",
  "long_text",
  "identifier",
  "url",
  "select",
  "multiselect",
  "multi_select",
]);
const JOB_SELECT = `
  id,
  organization_id,
  requested_by,
  job_type,
  status,
  source_locale_id,
  target_locale_ids,
  scope,
  field_selection,
  product_ids,
  provider,
  provider_meta,
  estimated_chars,
  actual_chars,
  error_summary,
  metadata,
  started_at,
  completed_at,
  created_at,
  updated_at
`;

function isJobType(value: unknown): value is JobType {
  return value === "translate" || value === "write_assist";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }
  return Array.from(unique);
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveExecutionMode(value: unknown): ExecutionMode {
  const requested =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (requested === "sync" || requested === "async") {
    return requested;
  }

  const fromEnv = String(process.env.LOCALIZATION_JOB_EXECUTION_MODE || "")
    .trim()
    .toLowerCase();
  return fromEnv === "async" ? "async" : "sync";
}

function toTextValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const values = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    if (values.length === 0) return null;
    return values.join("\n");
  }

  if (value && typeof value === "object") {
    const objectValues = Object.values(value as Record<string, unknown>)
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    if (objectValues.length === 0) return null;
    return objectValues.join("\n");
  }

  return null;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeUuidArray(value: unknown): string[] {
  return normalizeStringArray(value).filter(isUuidLike);
}

function extractFieldValue(product: ProductRow, fieldCode: string): string | null {
  switch (fieldCode) {
    case "product_name":
      return toTextValue(product.product_name);
    case "short_description":
      return toTextValue(product.short_description);
    case "long_description":
      return toTextValue(product.long_description);
    case "features":
      return toTextValue(product.features);
    case "meta_title":
      return toTextValue(product.meta_title);
    case "meta_description":
      return toTextValue(product.meta_description);
    default:
      return null;
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function countCharacters(text: string): number {
  return Array.from(text).length;
}

async function resolveLocalizationSettings(organizationId: string): Promise<{
  translationEnabled: boolean;
  writeAssistEnabled: boolean;
  deeplGlossaryId: string | null;
  brandInstructions: string;
  preferredTone: PreferredTone;
  foundationMissing: boolean;
}> {
  const { data, error } = await (supabaseServer as any)
    .from("organization_localization_settings")
    .select("translation_enabled,write_assist_enabled,deepl_glossary_id,brand_instructions,preferred_tone")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    if (isMissingLocalizationFoundationError(error)) {
      return {
        translationEnabled: false,
        writeAssistEnabled: false,
        deeplGlossaryId: null,
        brandInstructions: "",
        preferredTone: "neutral",
        foundationMissing: true,
      };
    }
    console.error("Failed to resolve localization settings:", error);
  }

  return {
    translationEnabled: Boolean(data?.translation_enabled),
    writeAssistEnabled: Boolean(data?.write_assist_enabled),
    deeplGlossaryId:
      typeof data?.deepl_glossary_id === "string" && data.deepl_glossary_id.trim().length > 0
        ? data.deepl_glossary_id.trim()
        : null,
    brandInstructions:
      typeof data?.brand_instructions === "string" ? data.brand_instructions.trim() : "",
    preferredTone:
      data?.preferred_tone === "formal" ||
      data?.preferred_tone === "informal" ||
      data?.preferred_tone === "professional" ||
      data?.preferred_tone === "friendly"
        ? data.preferred_tone
        : "neutral",
    foundationMissing: false,
  };
}

async function resolveLocales(organizationId: string): Promise<LocaleRow[]> {
  const { data, error } = await (supabaseServer as any)
    .from("locales")
    .select("id,code,name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    throw new Error("Failed to load locales");
  }
  return (data || []) as LocaleRow[];
}

async function resolveProducts(organizationId: string, productIds: string[]): Promise<ProductRow[]> {
  const { data, error } = await (supabaseServer as any)
    .from("products")
    .select(
      "id,type,parent_id,product_name,short_description,long_description,features,meta_title,meta_description,created_by,last_modified_by"
    )
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (error) {
    throw new Error("Failed to load products");
  }
  return (data || []) as ProductRow[];
}

async function resolveParentProductsForVariants(
  organizationId: string,
  products: ProductRow[]
): Promise<Map<string, ProductRow>> {
  const parentIds = Array.from(
    new Set(
      products
        .filter((product) => product.type === "variant" && typeof product.parent_id === "string" && product.parent_id.trim().length > 0)
        .map((product) => String(product.parent_id).trim())
    )
  );

  if (parentIds.length === 0) {
    return new Map<string, ProductRow>();
  }

  const { data, error } = await (supabaseServer as any)
    .from("products")
    .select(
      "id,type,parent_id,product_name,short_description,long_description,features,meta_title,meta_description,created_by,last_modified_by"
    )
    .eq("organization_id", organizationId)
    .in("id", parentIds);

  if (error) {
    throw new Error("Failed to load parent products for variant inheritance");
  }

  const map = new Map<string, ProductRow>();
  for (const row of (data || []) as ProductRow[]) {
    map.set(row.id, row);
  }
  return map;
}

async function resolveTranslatableProductFields(params: {
  organizationId: string;
  jobType: JobType;
  requestedProductFieldIds: string[];
}): Promise<ProductFieldRow[]> {
  if (params.requestedProductFieldIds.length === 0) {
    return [];
  }

  const { data, error } = await (supabaseServer as any)
    .from("product_fields")
    .select("id,code,field_type,is_translatable,is_write_assist_enabled,is_active")
    .eq("organization_id", params.organizationId)
    .in("id", params.requestedProductFieldIds);

  if (error) {
    throw new Error("Failed to load selected product fields");
  }

  const rows = (data || []) as ProductFieldRow[];
  return rows.filter((row) => {
    if (!row || !row.id || !row.code) return false;
    if (row.is_active === false) return false;
    const fieldType = String(row.field_type || "").trim().toLowerCase();
    if (!TEXTUAL_PRODUCT_FIELD_TYPES.has(fieldType)) return false;
    if (params.jobType === "translate") {
      return Boolean(row.is_translatable);
    }
    return Boolean(row.is_write_assist_enabled || row.is_translatable);
  });
}

async function resolveProductFieldValues(params: {
  organizationId: string;
  productIds: string[];
  productFieldIds: string[];
}): Promise<ProductFieldValueRow[]> {
  if (params.productIds.length === 0 || params.productFieldIds.length === 0) {
    return [];
  }

  const { data, error } = await (supabaseServer as any)
    .from("product_field_values")
    .select(
      "product_id,product_field_id,value_text,value_number,value_boolean,value_date,value_datetime,value_json,market_id,channel_id,destination_id,locale_id"
    )
    .eq("organization_id", params.organizationId)
    .in("product_id", params.productIds)
    .in("product_field_id", params.productFieldIds);

  if (error) {
    throw new Error("Failed to load product field values for translation");
  }

  return (data || []) as ProductFieldValueRow[];
}

function scoreScopeMatch(params: {
  row: ProductFieldValueRow;
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  sourceLocaleId: string | null;
}): number {
  const { row, sourceMarketId, sourceChannelId, sourceDestinationId, sourceLocaleId } = params;

  const dimensionScore = (
    actual: string | null,
    desired: string | null,
    weight: number
  ): number => {
    if (desired) {
      if (actual === desired) return weight;
      if (actual === null) return 1;
      return -1000;
    }
    if (actual === null) return 2;
    return -1000;
  };

  return (
    dimensionScore(row.market_id, sourceMarketId, 32) +
    dimensionScore(row.channel_id, sourceChannelId, 24) +
    dimensionScore(row.destination_id, sourceDestinationId, 16) +
    dimensionScore(row.locale_id, sourceLocaleId, 24)
  );
}

function pickBestSourceValue(params: {
  rows: ProductFieldValueRow[];
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  sourceLocaleId: string | null;
}): string | null {
  if (!params.rows.length) return null;
  const candidates = params.rows
    .map((row) => ({
      row,
      score: scoreScopeMatch({
        row,
        sourceMarketId: params.sourceMarketId,
        sourceChannelId: params.sourceChannelId,
        sourceDestinationId: params.sourceDestinationId,
        sourceLocaleId: params.sourceLocaleId,
      }),
    }))
    .filter((entry) => entry.score > -500)
    .sort((a, b) => b.score - a.score);

  for (const entry of candidates) {
    const value =
      entry.row.value_text ??
      entry.row.value_number ??
      entry.row.value_boolean ??
      entry.row.value_date ??
      entry.row.value_datetime ??
      entry.row.value_json;
    const asText = toTextValue(value);
    if (asText) return asText;
  }

  return null;
}

function buildProductFieldSourceTextMap(params: {
  rows: ProductFieldValueRow[];
  productIds: string[];
  productFieldIds: string[];
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  sourceLocaleId: string | null;
}): Map<string, string> {
  const rowsByKey = new Map<string, ProductFieldValueRow[]>();
  for (const row of params.rows) {
    const key = `${row.product_id}::${row.product_field_id}`;
    const existing = rowsByKey.get(key);
    if (existing) {
      existing.push(row);
    } else {
      rowsByKey.set(key, [row]);
    }
  }

  const map = new Map<string, string>();
  for (const productId of params.productIds) {
    for (const productFieldId of params.productFieldIds) {
      const key = `${productId}::${productFieldId}`;
      const rows = rowsByKey.get(key) || [];
      const sourceText = pickBestSourceValue({
        rows,
        sourceMarketId: params.sourceMarketId,
        sourceChannelId: params.sourceChannelId,
        sourceDestinationId: params.sourceDestinationId,
        sourceLocaleId: params.sourceLocaleId,
      });
      if (sourceText) {
        map.set(key, sourceText);
      }
    }
  }

  return map;
}

function toSourceHash(params: {
  fieldCode: string;
  sourceText: string;
  productFieldId: string | null;
}): string {
  return createHash("sha256")
    .update(
      `${params.productFieldId || "system"}::${params.fieldCode}::${params.sourceText}`
    )
    .digest("hex");
}

async function generateTranslatedItems(
  workItems: JobWorkItem[],
  options?: {
    context?: string;
    glossaryId?: string | null;
    formality?: "default" | "more" | "less" | "prefer_more" | "prefer_less";
  }
): Promise<{
  items: GeneratedItem[];
  actualChars: number;
}> {
  const grouped = new Map<string, JobWorkItem[]>();
  for (const item of workItems) {
    const key = `${item.sourceLocaleCode}::${item.targetLocaleCode}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  const generated: GeneratedItem[] = [];
  let actualChars = 0;

  for (const [, localeGroup] of grouped) {
    const sourceLocaleCode = localeGroup[0]?.sourceLocaleCode;
    const targetLocaleCode = localeGroup[0]?.targetLocaleCode;
    const chunks = chunkArray(localeGroup, MAX_TEXT_BATCH_SIZE);

    for (const chunk of chunks) {
      try {
        const response = await translateWithDeepL({
          texts: chunk.map((entry) => entry.sourceText),
          sourceLocaleCode,
          targetLocaleCode,
          context: options?.context || "Product content translation",
          glossaryId: options?.glossaryId || undefined,
          formality: options?.formality || "default",
        });

        for (let index = 0; index < chunk.length; index += 1) {
          const translated = response[index];
          const billedChars = Number.isFinite(translated?.billedCharacters)
            ? Math.max(0, Number(translated.billedCharacters))
            : countCharacters(chunk[index].sourceText);

          actualChars += billedChars;
          generated.push({
            workItem: chunk[index],
            status: "generated",
            suggestedText: translated?.translatedText || "",
            billedChars,
            detectedSourceLanguage: translated?.detectedSourceLanguage,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Translation request failed";
        for (const entry of chunk) {
          generated.push({
            workItem: entry,
            status: "failed",
            billedChars: 0,
            errorMessage: message,
          });
        }
      }
    }
  }

  return { items: generated, actualChars };
}

function mapPreferredToneToDeepLFormality(
  tone: PreferredTone
): "default" | "prefer_more" | "prefer_less" {
  if (tone === "formal" || tone === "professional") return "prefer_more";
  if (tone === "informal" || tone === "friendly") return "prefer_less";
  return "default";
}

function mapPreferredToneToWriteStyle(
  tone: PreferredTone
):
  | "default"
  | "prefer_business"
  | "prefer_casual" {
  if (tone === "formal" || tone === "professional") return "prefer_business";
  if (tone === "informal" || tone === "friendly") return "prefer_casual";
  return "default";
}

function mapPreferredToneToWriteTone(
  tone: PreferredTone
):
  | "default"
  | "prefer_friendly"
  | "prefer_confident"
  | "prefer_diplomatic" {
  if (tone === "friendly") return "prefer_friendly";
  if (tone === "informal") return "prefer_confident";
  if (tone === "formal" || tone === "professional") return "prefer_diplomatic";
  return "default";
}

type WriteAssistTone =
  | "default"
  | "prefer_friendly"
  | "prefer_confident"
  | "prefer_diplomatic"
  | "prefer_enthusiastic";

type WriteAssistStyle =
  | "default"
  | "prefer_business"
  | "prefer_casual"
  | "prefer_academic"
  | "prefer_simple";

function deriveWriteAssistControls(params: {
  preferredTone: PreferredTone;
  brandInstructions: string;
}): {
  tone: WriteAssistTone;
  writingStyle: WriteAssistStyle;
  source: "preferred_tone" | "brand_instructions" | "default";
  reason: string;
} {
  const fromPreferredTone = mapPreferredToneToWriteTone(params.preferredTone);
  const fromPreferredStyle = mapPreferredToneToWriteStyle(params.preferredTone);
  if (fromPreferredTone !== "default") {
    return {
      tone: fromPreferredTone,
      writingStyle: "default",
      source: "preferred_tone",
      reason: `tone derived from preferred_tone=${params.preferredTone}`,
    };
  }
  if (fromPreferredStyle !== "default") {
    return {
      tone: "default",
      writingStyle: fromPreferredStyle,
      source: "preferred_tone",
      reason: `writing_style derived from preferred_tone=${params.preferredTone}`,
    };
  }

  const instructions = params.brandInstructions.toLowerCase();
  const hasAnyInstruction = instructions.trim().length > 0;
  if (hasAnyInstruction) {
    if (/(friendly|warm|approachable|human)/.test(instructions)) {
      return {
        tone: "prefer_friendly",
        writingStyle: "default",
        source: "brand_instructions",
        reason: "tone inferred from brand instructions keywords (friendly/warm)",
      };
    }
    if (/(confident|assertive|direct)/.test(instructions)) {
      return {
        tone: "prefer_confident",
        writingStyle: "default",
        source: "brand_instructions",
        reason: "tone inferred from brand instructions keywords (confident/assertive)",
      };
    }
    if (/(diplomatic|polite|tactful)/.test(instructions)) {
      return {
        tone: "prefer_diplomatic",
        writingStyle: "default",
        source: "brand_instructions",
        reason: "tone inferred from brand instructions keywords (diplomatic/polite)",
      };
    }
    if (/(enthusiastic|energetic|excited)/.test(instructions)) {
      return {
        tone: "prefer_enthusiastic",
        writingStyle: "default",
        source: "brand_instructions",
        reason: "tone inferred from brand instructions keywords (enthusiastic/energetic)",
      };
    }
    if (/(business|corporate|professional|executive)/.test(instructions)) {
      return {
        tone: "default",
        writingStyle: "prefer_business",
        source: "brand_instructions",
        reason: "writing_style inferred from brand instructions keywords (business/professional)",
      };
    }
    if (/(casual|conversational|relaxed)/.test(instructions)) {
      return {
        tone: "default",
        writingStyle: "prefer_casual",
        source: "brand_instructions",
        reason: "writing_style inferred from brand instructions keywords (casual/conversational)",
      };
    }
    if (/(academic|scientific|technical)/.test(instructions)) {
      return {
        tone: "default",
        writingStyle: "prefer_academic",
        source: "brand_instructions",
        reason: "writing_style inferred from brand instructions keywords (academic/technical)",
      };
    }
    if (/(simple|plain|easy to understand|clear language)/.test(instructions)) {
      return {
        tone: "default",
        writingStyle: "prefer_simple",
        source: "brand_instructions",
        reason: "writing_style inferred from brand instructions keywords (simple/clear)",
      };
    }
  }

  return {
    tone: "default",
    writingStyle: "default",
    source: "default",
    reason: "no explicit tone/style detected; using provider defaults",
  };
}

function buildTranslationContext(brandInstructions: string): string {
  const base = "Product content translation";
  const instructions = brandInstructions.trim();
  if (!instructions) return base;
  return `${base}. Brand instructions: ${instructions}`.slice(0, 1200);
}

async function buildWriteAssistItems(
  workItems: JobWorkItem[],
  options: {
    controls: {
      tone: WriteAssistTone;
      writingStyle: WriteAssistStyle;
    };
  }
): Promise<{ items: GeneratedItem[]; actualChars: number }> {
  const grouped = new Map<string, JobWorkItem[]>();
  for (const item of workItems) {
    const key = item.targetLocaleCode;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  const generated: GeneratedItem[] = [];
  let actualChars = 0;
  const writingStyle = options.controls.writingStyle;
  const tone = options.controls.tone;

  for (const [targetLocaleCode, localeGroup] of grouped) {
    const chunks = chunkArray(localeGroup, MAX_TEXT_BATCH_SIZE);
    for (const chunk of chunks) {
      try {
        const response = await improveTextWithDeepL({
          texts: chunk.map((entry) => entry.sourceText),
          targetLocaleCode,
          writingStyle,
          tone,
        });

        for (let index = 0; index < chunk.length; index += 1) {
          const rewritten = response[index];
          const billedChars = Number.isFinite(rewritten?.billedCharacters)
            ? Math.max(0, Number(rewritten.billedCharacters))
            : countCharacters(chunk[index].sourceText);
          actualChars += billedChars;
          generated.push({
            workItem: chunk[index],
            status: "generated",
            suggestedText: rewritten?.improvedText || chunk[index].sourceText,
            billedChars,
            detectedSourceLanguage: rewritten?.detectedSourceLanguage,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Write Assist request failed";
        for (const entry of chunk) {
          generated.push({
            workItem: entry,
            status: "failed",
            billedChars: 0,
            errorMessage: message,
          });
        }
      }
    }
  }

  return { items: generated, actualChars };
}

async function buildJobWorkItems(params: {
  organizationId: string;
  jobType: JobType;
  products: ProductRow[];
  parentProductsById: Map<string, ProductRow>;
  activeFieldCodes: string[];
  requestedProductFieldIds: string[];
  sourceLocaleId: string;
  sourceLocaleCode: string;
  targetLocaleIds: string[];
  localeById: Map<string, LocaleRow>;
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  targetMarketId: string | null;
  targetChannelId: string | null;
  targetDestinationId: string | null;
}): Promise<{
  workItems: JobWorkItem[];
  activeCustomFields: ProductFieldRow[];
}> {
  const targets = params.jobType === "translate" ? params.targetLocaleIds : [params.sourceLocaleId];
  const workItems: JobWorkItem[] = [];

  for (const product of params.products) {
    for (const fieldCode of params.activeFieldCodes) {
      let sourceText = extractFieldValue(product, fieldCode);
      if (!sourceText && product.type === "variant" && product.parent_id) {
        const parentProduct = params.parentProductsById.get(product.parent_id);
        if (parentProduct) {
          sourceText = extractFieldValue(parentProduct, fieldCode);
        }
      }
      if (!sourceText) continue;

      for (const targetLocaleId of targets) {
        const targetLocale = params.localeById.get(targetLocaleId);
        if (!targetLocale) continue;
        workItems.push({
          productId: product.id,
          fieldCode,
          productFieldId: null,
          sourceText,
          targetLocaleId,
          targetLocaleCode: targetLocale.code,
          sourceLocaleCode: params.sourceLocaleCode,
          sourceMarketId: params.sourceMarketId,
          sourceChannelId: params.sourceChannelId,
          sourceDestinationId: params.sourceDestinationId,
          targetMarketId: params.targetMarketId,
          targetChannelId: params.targetChannelId,
          targetDestinationId: params.targetDestinationId,
        });
      }
    }
  }

  const activeCustomFields = await resolveTranslatableProductFields({
    organizationId: params.organizationId,
    jobType: params.jobType,
    requestedProductFieldIds: params.requestedProductFieldIds,
  });

  if (activeCustomFields.length === 0) {
    return { workItems, activeCustomFields };
  }

  const activeCustomFieldIds = activeCustomFields.map((field) => field.id);
  const customValueRows = await resolveProductFieldValues({
    organizationId: params.organizationId,
    productIds: params.products.map((product) => product.id),
    productFieldIds: activeCustomFieldIds,
  });
  const customSourceTextByProductAndField = buildProductFieldSourceTextMap({
    rows: customValueRows,
    productIds: params.products.map((product) => product.id),
    productFieldIds: activeCustomFieldIds,
    sourceMarketId: params.sourceMarketId,
    sourceChannelId: params.sourceChannelId,
    sourceDestinationId: params.sourceDestinationId,
    sourceLocaleId: params.sourceLocaleId,
  });

  for (const product of params.products) {
    for (const field of activeCustomFields) {
      const ownKey = `${product.id}::${field.id}`;
      let sourceText = customSourceTextByProductAndField.get(ownKey) || null;
      if (!sourceText && product.type === "variant" && product.parent_id) {
        const parentKey = `${product.parent_id}::${field.id}`;
        sourceText = customSourceTextByProductAndField.get(parentKey) || null;
      }
      if (!sourceText) continue;

      for (const targetLocaleId of targets) {
        const targetLocale = params.localeById.get(targetLocaleId);
        if (!targetLocale) continue;
        workItems.push({
          productId: product.id,
          fieldCode: field.code,
          productFieldId: field.id,
          sourceText,
          targetLocaleId,
          targetLocaleCode: targetLocale.code,
          sourceLocaleCode: params.sourceLocaleCode,
          sourceMarketId: params.sourceMarketId,
          sourceChannelId: params.sourceChannelId,
          sourceDestinationId: params.sourceDestinationId,
          targetMarketId: params.targetMarketId,
          targetChannelId: params.targetChannelId,
          targetDestinationId: params.targetDestinationId,
        });
      }
    }
  }

  return { workItems, activeCustomFields };
}

type JobExecutionParams = {
  jobId: string;
  organizationId: string;
  sourceLocaleId: string;
  jobType: JobType;
  workItems: JobWorkItem[];
  localizationSettings: {
    deeplGlossaryId: string | null;
    preferredTone: PreferredTone;
    brandInstructions: string;
  };
  writeAssistControls: {
    tone: WriteAssistTone;
    writingStyle: WriteAssistStyle;
    source: "preferred_tone" | "brand_instructions" | "default";
    reason: string;
  };
  deeplFormality: "default" | "prefer_more" | "prefer_less";
  translationContext: string;
};

export async function runLocalizationJobGeneration(
  params: JobExecutionParams
): Promise<{
  status: JobStatus;
  actualChars: number;
  generatedItems: number;
  failedItems: number;
}> {
  const generatedResult =
    params.jobType === "translate"
      ? await generateTranslatedItems(params.workItems, {
          context: params.translationContext,
          glossaryId: params.localizationSettings.deeplGlossaryId,
          formality: params.deeplFormality,
        })
      : await buildWriteAssistItems(params.workItems, {
          controls: {
            tone: params.writeAssistControls.tone,
            writingStyle: params.writeAssistControls.writingStyle,
          },
        });

  const generatedItems = generatedResult.items;
  const generatedCount = generatedItems.filter((item) => item.status === "generated").length;
  const failedCount = generatedItems.length - generatedCount;
  const actualChars = Math.max(0, generatedResult.actualChars);

  const itemRows = generatedItems.map((item) => {
    const sourceScope = {
      localeId: params.sourceLocaleId,
      marketId: item.workItem.sourceMarketId,
      channelId: item.workItem.sourceChannelId,
      destinationId: item.workItem.sourceDestinationId,
    };
    const targetScope = {
      localeId: item.workItem.targetLocaleId,
      marketId: item.workItem.targetMarketId,
      channelId: item.workItem.targetChannelId,
      destinationId: item.workItem.targetDestinationId,
    };
    return {
      job_id: params.jobId,
      organization_id: params.organizationId,
      product_id: item.workItem.productId,
      product_field_id: item.workItem.productFieldId,
      field_code: item.workItem.fieldCode,
      source_scope: sourceScope,
      target_scope: targetScope,
      source_value: { text: item.workItem.sourceText },
      suggested_value: item.status === "generated" ? { text: item.suggestedText || "" } : null,
      edited_value: null,
      final_value: null,
      source_hash: toSourceHash({
        fieldCode: item.workItem.fieldCode,
        sourceText: item.workItem.sourceText,
        productFieldId: item.workItem.productFieldId,
      }),
      status: item.status,
      reviewed_by: null,
      reviewed_at: null,
      applied_by: null,
      applied_at: null,
      provider_request_meta: {
        sourceLocale: item.workItem.sourceLocaleCode,
        targetLocale: item.workItem.targetLocaleCode,
        jobType: params.jobType,
        deeplGlossaryId: params.localizationSettings.deeplGlossaryId,
        preferredTone: params.localizationSettings.preferredTone,
        hasBrandInstructions: params.localizationSettings.brandInstructions.length > 0,
        writeStyle: params.writeAssistControls.writingStyle,
        writeTone: params.writeAssistControls.tone,
        writeControlSource: params.writeAssistControls.source,
        writeControlReason: params.writeAssistControls.reason,
      },
      provider_response_meta: {
        billedChars: item.billedChars,
        detectedSourceLanguage: item.detectedSourceLanguage || null,
      },
      error_message: item.errorMessage || null,
      metadata: {
        source: "phase_d0",
      },
    };
  });

  const { error: itemInsertError } = await (supabaseServer as any)
    .from("translation_job_items")
    .insert(itemRows);

  if (itemInsertError) {
    console.error("Failed to create translation job items:", itemInsertError);
    await (supabaseServer as any)
      .from("translation_jobs")
      .update({
        status: "failed",
        error_summary: "Failed to persist translation job items",
        completed_at: new Date().toISOString(),
        actual_chars: 0,
      })
      .eq("id", params.jobId)
      .eq("organization_id", params.organizationId);
    throw new Error("Failed to create localization job items");
  }

  const finalStatus: JobStatus =
    generatedCount === 0 ? "failed" : failedCount > 0 ? "review_required" : "review_required";
  const errorSummary =
    failedCount > 0 ? `${failedCount} item(s) failed during generation. Review job items for details.` : null;

  const { error: jobFinalizeError } = await (supabaseServer as any)
    .from("translation_jobs")
    .update({
      status: finalStatus,
      actual_chars: actualChars,
      error_summary: errorSummary,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.jobId)
    .eq("organization_id", params.organizationId);

  if (jobFinalizeError) {
    console.error("Failed to finalize translation job status:", jobFinalizeError);
  }

  if (actualChars > 0 && generatedCount > 0) {
    const usageResult = await incrementLocalizationUsage({
      organizationId: params.organizationId,
      meter: params.jobType === "translate" ? "translation" : "write",
      chars: actualChars,
      source: "translation_job",
    });
    if (!usageResult.ok) {
      console.warn("Localization usage metering did not complete:", usageResult.reason);
    }
  }

  return {
    status: finalStatus,
    actualChars,
    generatedItems: generatedCount,
    failedItems: failedCount,
  };
}

export async function executeLocalizationJobById(params: {
  organizationId: string;
  jobId: string;
}): Promise<{
  status: JobStatus;
  estimatedChars: number;
  actualChars: number;
  generatedItems: number;
  failedItems: number;
}> {
  const { data: jobRow, error: jobError } = await (supabaseServer as any)
    .from("translation_jobs")
    .select(JOB_SELECT)
    .eq("organization_id", params.organizationId)
    .eq("id", params.jobId)
    .maybeSingle();

  if (jobError || !jobRow) {
    throw new Error("Localization job not found");
  }

  const jobTypeRaw = typeof jobRow.job_type === "string" ? jobRow.job_type : "";
  if (!isJobType(jobTypeRaw)) {
    throw new Error("Localization job has invalid job_type");
  }
  const jobType = jobTypeRaw as JobType;

  const sourceLocaleId =
    typeof jobRow.source_locale_id === "string" && jobRow.source_locale_id.trim().length > 0
      ? jobRow.source_locale_id.trim()
      : null;
  if (!sourceLocaleId) {
    throw new Error("Localization job has no source locale");
  }

  const productIds = normalizeStringArray(jobRow.product_ids);
  if (productIds.length === 0) {
    throw new Error("Localization job has no products");
  }

  const fieldSelection = normalizeObject(jobRow.field_selection);
  const activeFieldCodes = normalizeStringArray(fieldSelection.fieldCodes).map((code) => code.toLowerCase());
  const productFieldIds = normalizeUuidArray(fieldSelection.productFieldIds);
  const normalizedSystemFieldCodes = (
    activeFieldCodes.length > 0
      ? activeFieldCodes
      : productFieldIds.length === 0
        ? [...TRANSLATABLE_SYSTEM_FIELDS]
        : []
  ).filter((code) => (TRANSLATABLE_SYSTEM_FIELDS as readonly string[]).includes(code));

  if (normalizedSystemFieldCodes.length === 0 && productFieldIds.length === 0) {
    throw new Error("Localization job has no active fields");
  }

  const localizationSettings = await resolveLocalizationSettings(params.organizationId);
  if (localizationSettings.foundationMissing) {
    throw new Error("Localization foundation is unavailable");
  }
  if (jobType === "translate") {
    const { planId } = await getOrganizationBillingLimits(params.organizationId);
    if (planId === "starter") {
      throw new Error("Translation is unavailable on Starter. Upgrade plan to run this job.");
    }
  }
  if (jobType === "translate" && !localizationSettings.translationEnabled) {
    throw new Error("Translation is disabled in localization settings");
  }
  if (jobType === "write_assist" && !localizationSettings.writeAssistEnabled) {
    throw new Error("Write Assist is disabled in localization settings");
  }
  if (!isDeepLConfigured()) {
    throw new Error("DeepL is not configured");
  }

  const targetLocaleIdsRaw = normalizeStringArray(jobRow.target_locale_ids);
  const [locales, products] = await Promise.all([
    resolveLocales(params.organizationId),
    resolveProducts(params.organizationId, productIds),
  ]);
  const localeById = new Map(locales.map((locale) => [locale.id, locale]));
  const sourceLocale = localeById.get(sourceLocaleId);
  if (!sourceLocale) {
    throw new Error("Localization job source locale is not active");
  }

  const filteredTargetLocaleIds = Array.from(
    new Set(
      (jobType === "translate" ? targetLocaleIdsRaw : [sourceLocaleId]).filter((localeId) => {
        if (!localeById.has(localeId)) return false;
        if (jobType === "translate" && localeId === sourceLocaleId) return false;
        return true;
      })
    )
  );
  if (jobType === "translate" && filteredTargetLocaleIds.length === 0) {
    throw new Error("Localization job has no valid target locales");
  }

  const scope = normalizeObject(jobRow.scope);
  const scopeMarketIds = normalizeStringArray(scope.marketIds);
  const scopeChannelIds = normalizeStringArray(scope.channelIds);
  const scopeDestinationIds = normalizeStringArray(scope.destinationIds);
  const sourceMarketId = normalizeOptionalString(scope.sourceMarketId) || null;
  const sourceChannelId = normalizeOptionalString(scope.sourceChannelId) || null;
  const sourceDestinationId = normalizeOptionalString(scope.sourceDestinationId) || null;
  const targetMarketId = normalizeOptionalString(scope.targetMarketId) || scopeMarketIds[0] || null;
  const targetChannelId = normalizeOptionalString(scope.targetChannelId) || scopeChannelIds[0] || null;
  const targetDestinationId =
    normalizeOptionalString(scope.targetDestinationId) || scopeDestinationIds[0] || null;

  const parentProductsById = await resolveParentProductsForVariants(params.organizationId, products);
  const { workItems } = await buildJobWorkItems({
    organizationId: params.organizationId,
    jobType,
    products,
    parentProductsById,
    activeFieldCodes: normalizedSystemFieldCodes,
    requestedProductFieldIds: productFieldIds,
    sourceLocaleId,
    sourceLocaleCode: sourceLocale.code,
    targetLocaleIds: filteredTargetLocaleIds,
    localeById,
    sourceMarketId,
    sourceChannelId,
    sourceDestinationId,
    targetMarketId,
    targetChannelId,
    targetDestinationId,
  });

  if (workItems.length === 0) {
    await (supabaseServer as any)
      .from("translation_jobs")
      .update({
        status: "failed",
        error_summary: "No translatable content found for this job scope/fields.",
        completed_at: new Date().toISOString(),
      })
      .eq("organization_id", params.organizationId)
      .eq("id", params.jobId);
    return {
      status: "failed",
      estimatedChars: 0,
      actualChars: 0,
      generatedItems: 0,
      failedItems: 0,
    };
  }

  const estimatedChars = workItems.reduce((sum, entry) => sum + countCharacters(entry.sourceText), 0);
  const capacity = await assertBillingCapacity({
    organizationId: params.organizationId,
    meter: "deeplTotalCharCount",
    incrementBy: estimatedChars,
  });
  if (!capacity.allowed) {
    throw new Error(capacity.message || "Billing quota exceeded for localization usage");
  }

  const nowIso = new Date().toISOString();
  await (supabaseServer as any)
    .from("translation_jobs")
    .update({
      status: "running",
      error_summary: null,
      started_at: nowIso,
      completed_at: null,
      estimated_chars: estimatedChars,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.jobId);

  const { error: clearItemsError } = await (supabaseServer as any)
    .from("translation_job_items")
    .delete()
    .eq("organization_id", params.organizationId)
    .eq("job_id", params.jobId);
  if (clearItemsError) {
    throw new Error("Failed to clear prior job items before execution");
  }

  const deeplFormality = mapPreferredToneToDeepLFormality(localizationSettings.preferredTone);
  const translationContext = buildTranslationContext(localizationSettings.brandInstructions);
  const writeAssistControls = deriveWriteAssistControls({
    preferredTone: localizationSettings.preferredTone,
    brandInstructions: localizationSettings.brandInstructions,
  });
  const executionResult = await runLocalizationJobGeneration({
    jobId: params.jobId,
    organizationId: params.organizationId,
    sourceLocaleId,
    jobType,
    workItems,
    localizationSettings: {
      deeplGlossaryId: localizationSettings.deeplGlossaryId,
      preferredTone: localizationSettings.preferredTone,
      brandInstructions: localizationSettings.brandInstructions,
    },
    writeAssistControls,
    deeplFormality,
    translationContext,
  });

  return {
    ...executionResult,
    estimatedChars,
  };
}

// GET /api/[tenant]/localization/jobs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const limitRaw = Number(new URL(request.url).searchParams.get("limit") || 25);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 25;

    const { data, error } = await (supabaseServer as any)
      .from("translation_jobs")
      .select(JOB_SELECT)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingLocalizationFoundationError(error)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to list translation jobs:", error);
      return NextResponse.json({ error: "Failed to load translation jobs" }, { status: 500 });
    }

    const jobs = (data || []) as Array<Record<string, any>>;
    const jobIds = jobs.map((job) => job.id).filter(Boolean);

    let itemCountsByJobId: Record<string, Record<string, number>> = {};
    if (jobIds.length > 0) {
      const { data: itemRows, error: itemError } = await (supabaseServer as any)
        .from("translation_job_items")
        .select("job_id,status")
        .eq("organization_id", organization.id)
        .in("job_id", jobIds);

      if (itemError) {
        console.error("Failed to resolve translation job item counts:", itemError);
      } else {
        itemCountsByJobId = ((itemRows || []) as Array<{ job_id: string; status: string }>).reduce(
          (acc, row) => {
            if (!acc[row.job_id]) acc[row.job_id] = {};
            acc[row.job_id][row.status] = (acc[row.job_id][row.status] || 0) + 1;
            return acc;
          },
          {} as Record<string, Record<string, number>>
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        jobs: jobs.map((job) => ({
          ...job,
          item_counts: itemCountsByJobId[job.id] || {},
        })),
      },
    });
  } catch (error) {
    console.error("Error in localization jobs GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/localization/jobs
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const body = await request.json().catch(() => ({}));

    const rawJobType = typeof body?.jobType === "string" ? body.jobType : body?.job_type;
    if (!isJobType(rawJobType)) {
      return NextResponse.json({ error: "jobType must be 'translate' or 'write_assist'" }, { status: 400 });
    }
    const jobType = rawJobType as JobType;
    const executionMode = resolveExecutionMode(body?.executionMode ?? body?.execution_mode);

    const sourceLocaleId =
      typeof body?.sourceLocaleId === "string" && body.sourceLocaleId.trim().length > 0
        ? body.sourceLocaleId.trim()
        : typeof body?.source_locale_id === "string" && body.source_locale_id.trim().length > 0
          ? body.source_locale_id.trim()
          : null;
    if (!sourceLocaleId) {
      return NextResponse.json({ error: "sourceLocaleId is required" }, { status: 400 });
    }

    const productIds = normalizeStringArray(body?.productIds ?? body?.product_ids);
    if (productIds.length === 0) {
      return NextResponse.json({ error: "productIds must include at least one product" }, { status: 400 });
    }
    if (productIds.length > MAX_PRODUCTS_PER_JOB) {
      return NextResponse.json(
        { error: `productIds exceeds max supported size (${MAX_PRODUCTS_PER_JOB})` },
        { status: 400 }
      );
    }

    const requestedTargets = normalizeStringArray(body?.targetLocaleIds ?? body?.target_locale_ids);
    const targetLocaleIds = jobType === "translate" ? requestedTargets : [sourceLocaleId];
    if (jobType === "translate" && targetLocaleIds.length === 0) {
      return NextResponse.json(
        { error: "targetLocaleIds must include at least one target locale for translation jobs" },
        { status: 400 }
      );
    }

    const requestedFieldCodes = normalizeStringArray(body?.fieldCodes ?? body?.field_codes).map((code) =>
      code.toLowerCase()
    );
    const requestedProductFieldIds = normalizeUuidArray(
      body?.productFieldIds ??
        body?.product_field_ids ??
        normalizeObject(body?.fieldSelection).productFieldIds
    );
    const activeFieldCodes = (
      requestedFieldCodes.length > 0
        ? requestedFieldCodes
        : requestedProductFieldIds.length === 0
          ? [...TRANSLATABLE_SYSTEM_FIELDS]
          : []
    ).filter((code) => (TRANSLATABLE_SYSTEM_FIELDS as readonly string[]).includes(code));

    if (activeFieldCodes.length === 0 && requestedProductFieldIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one system field or custom translatable product field." },
        { status: 400 }
      );
    }

    const localizationSettings = await resolveLocalizationSettings(organization.id);
    if (localizationSettings.foundationMissing) {
      return NextResponse.json(
        { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
        { status: 503 }
      );
    }

    if (jobType === "translate") {
      const { planId } = await getOrganizationBillingLimits(organization.id);
      if (planId === "starter") {
        return NextResponse.json(
          {
            error:
              "Translation is unavailable on Starter. Upgrade to Free, Growth, Scale, or Enterprise to use Translate this product.",
            code: "PLAN_RESTRICTED",
            planId,
          },
          { status: 403 }
        );
      }
    }

    if (jobType === "translate" && !localizationSettings.translationEnabled) {
      return NextResponse.json(
        { error: "Translation is disabled. Enable it in Settings > Localization first." },
        { status: 403 }
      );
    }
    if (jobType === "write_assist" && !localizationSettings.writeAssistEnabled) {
      return NextResponse.json(
        { error: "Write Assist is disabled. Enable it in Settings > Localization first." },
        { status: 403 }
      );
    }

    if ((jobType === "translate" || jobType === "write_assist") && !isDeepLConfigured()) {
      return NextResponse.json(
        { error: "DeepL is not configured. Set DEEPL_API_KEY before creating localization jobs." },
        { status: 503 }
      );
    }

    const [locales, products] = await Promise.all([
      resolveLocales(organization.id),
      resolveProducts(organization.id, productIds),
    ]);

    if (products.length === 0) {
      return NextResponse.json({ error: "No matching products found for this organization" }, { status: 404 });
    }

    const localeById = new Map(locales.map((locale) => [locale.id, locale]));
    const sourceLocale = localeById.get(sourceLocaleId);
    if (!sourceLocale) {
      return NextResponse.json({ error: "sourceLocaleId is not active for this organization" }, { status: 400 });
    }

    const filteredTargetLocaleIds = Array.from(
      new Set(
        targetLocaleIds.filter((localeId) => {
          if (!localeById.has(localeId)) return false;
          if (jobType === "translate" && localeId === sourceLocaleId) return false;
          return true;
        })
      )
    );
    if (jobType === "translate" && filteredTargetLocaleIds.length === 0) {
      return NextResponse.json(
        { error: "No valid targetLocaleIds were provided (must be active and different from source)." },
        { status: 400 }
      );
    }

    const scope = normalizeObject(body?.scope);
    const scopeMarketIds = normalizeStringArray((scope as Record<string, unknown>).marketIds);
    const scopeChannelIds = normalizeStringArray((scope as Record<string, unknown>).channelIds);
    const scopeDestinationIds = normalizeStringArray((scope as Record<string, unknown>).destinationIds);

    const sourceMarketId =
      normalizeOptionalString(body?.sourceMarketId) || normalizeOptionalString(scope.sourceMarketId) || null;
    const sourceChannelId =
      normalizeOptionalString(body?.sourceChannelId) || normalizeOptionalString(scope.sourceChannelId) || null;
    const sourceDestinationId =
      normalizeOptionalString(body?.sourceDestinationId) || normalizeOptionalString(scope.sourceDestinationId) || null;
    const targetMarketId =
      normalizeOptionalString(body?.targetMarketId) ||
      normalizeOptionalString(scope.targetMarketId) ||
      scopeMarketIds[0] ||
      null;
    const targetChannelId =
      normalizeOptionalString(body?.targetChannelId) ||
      normalizeOptionalString(scope.targetChannelId) ||
      scopeChannelIds[0] ||
      null;
    const targetDestinationId =
      normalizeOptionalString(body?.targetDestinationId) ||
      normalizeOptionalString(scope.targetDestinationId) ||
      scopeDestinationIds[0] ||
      null;

    const parentProductsById = await resolveParentProductsForVariants(organization.id, products);
    const { workItems, activeCustomFields } = await buildJobWorkItems({
      organizationId: organization.id,
      jobType,
      products,
      parentProductsById,
      activeFieldCodes,
      requestedProductFieldIds,
      sourceLocaleId,
      sourceLocaleCode: sourceLocale.code,
      targetLocaleIds: filteredTargetLocaleIds,
      localeById,
      sourceMarketId,
      sourceChannelId,
      sourceDestinationId,
      targetMarketId,
      targetChannelId,
      targetDestinationId,
    });

    if (workItems.length === 0) {
      return NextResponse.json(
        { error: "No translatable content found for the selected products and fields." },
        { status: 400 }
      );
    }

    const estimatedChars = workItems.reduce((sum, entry) => sum + countCharacters(entry.sourceText), 0);
    const capacity = await assertBillingCapacity({
      organizationId: organization.id,
      meter: "deeplTotalCharCount",
      incrementBy: estimatedChars,
    });
    if (!capacity.allowed) {
      return NextResponse.json(
        {
          error: capacity.message || "Billing quota exceeded for localization usage.",
          capacity,
        },
        { status: 402 }
      );
    }

    const fieldSelection = normalizeObject(body?.fieldSelection);
    const providerMetaFromBody = normalizeObject(body?.providerMeta ?? body?.provider_meta);
    const metadata = normalizeObject(body?.metadata);
    const deeplFormality = mapPreferredToneToDeepLFormality(localizationSettings.preferredTone);
    const translationContext = buildTranslationContext(localizationSettings.brandInstructions);
    const writeAssistControls = deriveWriteAssistControls({
      preferredTone: localizationSettings.preferredTone,
      brandInstructions: localizationSettings.brandInstructions,
    });
    const activeCustomFieldIds = activeCustomFields.map((field) => field.id);

    const nowIso = new Date().toISOString();
    const { data: jobRow, error: jobInsertError } = await (supabaseServer as any)
      .from("translation_jobs")
      .insert({
        organization_id: organization.id,
        requested_by: userId,
        job_type: jobType,
        status: (executionMode === "async" ? "queued" : "running") as JobStatus,
        source_locale_id: sourceLocaleId,
        target_locale_ids: filteredTargetLocaleIds,
        scope,
        field_selection: {
          ...fieldSelection,
          fieldCodes: activeFieldCodes,
          productFieldIds: activeCustomFieldIds,
          mode:
            activeFieldCodes.length > 0 && activeCustomFieldIds.length > 0
              ? "system_and_custom_fields"
              : activeCustomFieldIds.length > 0
                ? "custom_fields_only"
                : "system_fields_only",
        },
        product_ids: productIds,
        provider: "deepl",
        provider_meta: {
          ...providerMetaFromBody,
          executionMode,
          deeplGlossaryId: localizationSettings.deeplGlossaryId,
          preferredTone: localizationSettings.preferredTone,
          brandInstructions: localizationSettings.brandInstructions,
          translationContext,
          deepLFormality: deeplFormality,
          writeAssistTone: writeAssistControls.tone,
          writeAssistStyle: writeAssistControls.writingStyle,
          writeAssistControlSource: writeAssistControls.source,
          writeAssistControlReason: writeAssistControls.reason,
        },
        estimated_chars: estimatedChars,
        metadata,
        started_at: executionMode === "sync" ? nowIso : null,
      })
      .select(JOB_SELECT)
      .single();

    if (jobInsertError) {
      if (isMissingLocalizationFoundationError(jobInsertError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to create translation job:", jobInsertError);
      return NextResponse.json({ error: "Failed to create localization job" }, { status: 500 });
    }

    if (executionMode === "async") {
      return NextResponse.json(
        {
          success: true,
          data: {
            jobId: jobRow.id,
            status: "queued",
            estimatedChars,
            actualChars: 0,
            generatedItems: 0,
            failedItems: 0,
            executionMode,
          },
        },
        { status: 201 }
      );
    }

    const executionResult = await runLocalizationJobGeneration({
      jobId: jobRow.id,
      organizationId: organization.id,
      sourceLocaleId,
      jobType,
      workItems,
      localizationSettings: {
        deeplGlossaryId: localizationSettings.deeplGlossaryId,
        preferredTone: localizationSettings.preferredTone,
        brandInstructions: localizationSettings.brandInstructions,
      },
      writeAssistControls,
      deeplFormality,
      translationContext,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          jobId: jobRow.id,
          status: executionResult.status,
          estimatedChars,
          actualChars: executionResult.actualChars,
          generatedItems: executionResult.generatedItems,
          failedItems: executionResult.failedItems,
          executionMode,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in localization jobs POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
