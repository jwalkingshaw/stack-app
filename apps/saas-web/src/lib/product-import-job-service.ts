import { createHash } from "node:crypto";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import type { Database, Json } from "@stack-app/database";
import { getSupabaseServer } from "@/lib/supabase";
import { setDatabaseUserContext } from "@/lib/user-context";
import { ensureFamilyAttributesFromFieldGroups } from "@/lib/family-attributes";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import type { NextRequest } from "next/server";
import {
  buildCsv,
  buildTemplateCsv,
  DEFAULT_TEMPLATE_FIELDS,
  dedupeTemplateFields,
  fieldBelongsToProductRow,
  hasCreatePayload,
  isUuidLike,
  normalizeImportScope,
  normalizeOptionalString,
  parseAssetReferenceValue,
  parseCsvText,
  parseRowByCode,
  resolveImportDisposition,
  scopeToSearchParams,
  type ImportIntent,
  type ImportRowStatus,
  type ImportScope,
  type TemplateFieldDefinition,
  type TemplateSource,
} from "@/lib/product-imports";

const supabase = getSupabaseServer();

type ImportContext = {
  tenant: string;
  organizationId: string;
  userId: string;
};

type ImportJobRow = Database["public"]["Tables"]["import_job_rows"]["Row"];
type ImportJob = Database["public"]["Tables"]["import_jobs"]["Row"];

type ProductLookupRow = {
  id: string;
  scin: string | null;
  sku: string | null;
  family_id: string | null;
  product_name: string;
  type: string;
};

type ProductFieldRow = {
  id: string;
  code: string;
  name: string;
  field_type: string;
  is_required: boolean | null;
};

type FamilyAttributeRow = {
  family_id: string;
  attribute_code: string;
  attribute_label: string;
  attribute_type: string;
  is_required: boolean | null;
  display_order: number | null;
};

type ChannelRuleRow = {
  field_code: string;
  is_required: boolean | null;
};

type FamilyRow = {
  id: string;
  code: string;
  name: string;
};

type ChannelRow = {
  id: string;
  code: string;
  name: string;
};

type ValidationSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  updateRows: number;
  createRows: number;
  deleteRows: number;
  assetLinkRows: number;
  invalidPreview: Array<{ rowNumber: number; errors: string[] }>;
};

type NormalizedRowPayload = {
  disposition: "update" | "create" | "delete";
  target_product_id: string | null;
  resolved_family_id: string | null;
  resolved_family_code: string | null;
  resolved_channel_id: string | null;
  parent_product_id: string | null;
  identifiers: {
    scin: string | null;
    sku: string | null;
    parent_scin: string | null;
  };
  field_updates: Record<string, unknown>;
  asset_updates: Array<{
    field_code: string;
    field_label: string;
    field_type: string;
    product_field_id: string | null;
    asset_id: string | null;
    asset_ref: string | null;
  }>;
};

type TemplateResolution = {
  family: FamilyRow | null;
  channel: ChannelRow | null;
  fields: TemplateFieldDefinition[];
  fieldRowsByCode: Map<string, ProductFieldRow>;
};

function normalizeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function inferAssetField(fieldType: string): boolean {
  return fieldType === "file" || fieldType === "image";
}

function coerceValue(value: string, fieldType: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;

  switch (fieldType) {
    case "number":
    case "decimal": {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : trimmed;
    }
    case "boolean":
      if (/^(true|yes|1)$/i.test(trimmed)) return true;
      if (/^(false|no|0)$/i.test(trimmed)) return false;
      return trimmed;
    case "multiselect":
    case "multi_select":
      return trimmed
        .split(/[;|]/)
        .map((item) => item.trim())
        .filter(Boolean);
    case "table":
    case "measurement":
    case "price":
    case "json":
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    default:
      return trimmed;
  }
}

function serializeErrors(errors: string[]): Json {
  return errors as unknown as Json;
}

function toNormalizedRowJson(value: NormalizedRowPayload): Json {
  return value as unknown as Json;
}

function hashFieldSet(fields: TemplateFieldDefinition[]): string {
  return createHash("sha1")
    .update(
      fields
        .map((field) => `${field.code}:${field.label}:${field.fieldType}:${field.isRequired ? "1" : "0"}`)
        .join("|")
    )
    .digest("hex");
}

export async function resolveImportContext(request: NextRequest, tenant: string): Promise<ImportContext> {
  const contextResult = await resolveTenantBrandViewContext({
    request,
    tenantSlug: tenant,
    selectedBrandSlug: null,
  });
  if (!contextResult.ok) {
    throw new Error("ACCESS_DENIED");
  }
  if (contextResult.context.mode === "partner_brand") {
    throw new Error("Cross-tenant imports are blocked in shared brand view.");
  }

  const { getUser, getOrganization } = getKindeServerSession();
  const [user, kindeOrg] = await Promise.all([getUser(), getOrganization()]);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

  return {
    tenant,
    organizationId: contextResult.context.targetOrganization.id,
    userId: user.id,
  };
}

async function resolveFamilyByKey(params: {
  organizationId: string;
  familyKey: string | null;
}): Promise<FamilyRow | null> {
  const familyKey = normalizeOptionalString(params.familyKey);
  if (!familyKey) return null;

  let query = supabase
    .from("product_families")
    .select("id, code, name")
    .eq("organization_id", params.organizationId);

  if (isUuidLike(familyKey)) {
    query = query.eq("id", familyKey);
  } else {
    query = query.eq("code", normalizeCode(familyKey));
  }

  const { data } = await query.maybeSingle();
  return data
    ? {
        id: data.id,
        code: String(data.code || ""),
        name: data.name,
      }
    : null;
}

async function resolveChannelByKey(params: {
  organizationId: string;
  channelKey: string | null;
}): Promise<ChannelRow | null> {
  const channelKey = normalizeOptionalString(params.channelKey);
  if (!channelKey) return null;

  let query = supabase
    .from("output_channel_profiles")
    .select("id, code, name")
    .eq("organization_id", params.organizationId)
    .eq("is_active", true);

  if (isUuidLike(channelKey)) {
    query = query.eq("id", channelKey);
  } else {
    query = query.eq("code", normalizeCode(channelKey));
  }

  const { data } = await query.maybeSingle();
  return data
    ? {
        id: data.id,
        code: String(data.code || ""),
        name: data.name,
      }
    : null;
}

async function loadProductFieldsByCodes(organizationId: string, codes: string[]): Promise<Map<string, ProductFieldRow>> {
  if (codes.length === 0) return new Map();
  const { data } = await supabase
    .from("product_fields")
    .select("id, code, name, field_type, is_required")
    .eq("organization_id", organizationId)
    .in("code", codes);

  const map = new Map<string, ProductFieldRow>();
  for (const row of (data || []) as ProductFieldRow[]) {
    map.set(row.code, row);
  }
  return map;
}

export async function resolveTemplate(params: {
  organizationId: string;
  templateSource: TemplateSource;
  familyKey?: string | null;
  channelKey?: string | null;
}): Promise<TemplateResolution> {
  const family = await resolveFamilyByKey({
    organizationId: params.organizationId,
    familyKey: params.familyKey ?? null,
  });

  let channel: ChannelRow | null = null;
  if (params.templateSource === "channel") {
    channel = await resolveChannelByKey({
      organizationId: params.organizationId,
      channelKey: params.channelKey ?? null,
    });
    if (!channel) {
      throw new Error("Selected channel was not found.");
    }
  }

  const extraFields: TemplateFieldDefinition[] = [];

  if (params.templateSource === "family") {
    if (!family) {
      throw new Error("Selected family was not found.");
    }
    await ensureFamilyAttributesFromFieldGroups(family.id);

    const { data } = await supabase
      .from("family_attributes")
      .select("family_id, attribute_code, attribute_label, attribute_type, is_required, display_order")
      .eq("organization_id", params.organizationId)
      .eq("family_id", family.id)
      .order("display_order", { ascending: true });

    const attributes = (data || []) as FamilyAttributeRow[];
    const fieldRowsByCode = await loadProductFieldsByCodes(
      params.organizationId,
      attributes.map((attribute) => attribute.attribute_code)
    );

    for (const attribute of attributes) {
      const fieldRow = fieldRowsByCode.get(attribute.attribute_code);
      const fieldType = fieldRow?.field_type || attribute.attribute_type || "text";
      extraFields.push({
        code: attribute.attribute_code,
        label: fieldRow?.name || attribute.attribute_label,
        fieldType,
        isRequired: Boolean(attribute.is_required),
        isAssetField: inferAssetField(fieldType),
        source: "family",
      });
    }

    return {
      family,
      channel: null,
      fields: dedupeTemplateFields([...DEFAULT_TEMPLATE_FIELDS, ...extraFields]),
      fieldRowsByCode,
    };
  }

  const { data: rulesRaw } = await supabase
    .from("output_profile_field_rules")
    .select("field_code, is_required")
    .eq("profile_id", channel!.id);

  const rules = (rulesRaw || []) as ChannelRuleRow[];
  const fieldRowsByCode = await loadProductFieldsByCodes(
    params.organizationId,
    rules.map((rule) => rule.field_code)
  );

  for (const rule of rules) {
    const fieldRow = fieldRowsByCode.get(rule.field_code);
    extraFields.push({
      code: rule.field_code,
      label: fieldRow?.name || rule.field_code,
      fieldType: fieldRow?.field_type || "text",
      isRequired: Boolean(rule.is_required),
      isAssetField: inferAssetField(fieldRow?.field_type || "text"),
      source: "channel",
    });
  }

  return {
    family,
    channel,
    fields: dedupeTemplateFields([...DEFAULT_TEMPLATE_FIELDS, ...extraFields]),
    fieldRowsByCode,
  };
}

export async function createImportJob(params: {
  organizationId: string;
  userId: string;
  intent: ImportIntent;
  templateSource: TemplateSource;
  familyId?: string | null;
  channelId?: string | null;
  scope: ImportScope;
  sourceFilename?: string | null;
}): Promise<ImportJob> {
  const { data, error } = await supabase
    .from("import_jobs")
    .insert({
      organization_id: params.organizationId,
      requested_by: params.userId,
      job_type: "product_data",
      intent: params.intent,
      template_source: params.templateSource,
      family_id: params.familyId ?? null,
      channel_id: params.channelId ?? null,
      scope: params.scope as unknown as Json,
      source_filename: params.sourceFilename ?? null,
      summary: {},
      metadata: {},
      status: "queued",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create import job.");
  }
  return data;
}

export async function getImportJob(organizationId: string, jobId: string): Promise<ImportJob | null> {
  const { data } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", jobId)
    .maybeSingle();

  return data ?? null;
}

export async function listImportJobs(organizationId: string): Promise<ImportJob[]> {
  const { data } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data || []) as ImportJob[];
}

export async function uploadCsvToJob(params: {
  job: ImportJob;
  filename: string | null;
  text: string;
}): Promise<{ rowCount: number; headerCount: number }> {
  const parsed = parseCsvText(params.text);

  await supabase.from("import_job_rows").delete().eq("job_id", params.job.id);

  if (parsed.rows.length > 0) {
    const payload = parsed.rows.map((row, index) => ({
      job_id: params.job.id,
      organization_id: params.job.organization_id,
      row_number: index + 1,
      status: "pending" as ImportRowStatus,
      raw_payload: row,
      normalized_payload: {},
      result: {},
      errors: [],
    }));
    const { error } = await supabase.from("import_job_rows").insert(payload);
    if (error) {
      throw new Error(error.message || "Failed to upload CSV rows.");
    }
  }

  const { error: jobError } = await supabase
    .from("import_jobs")
    .update({
      source_filename: params.filename,
      uploaded_row_count: parsed.rows.length,
      applied_row_count: 0,
      failed_row_count: 0,
      summary: {
        headers: parsed.headers,
      },
      metadata: {
        template_header_hash: createHash("sha1").update(parsed.headers.join("|")).digest("hex"),
      },
      status: "uploaded",
      error_summary: null,
      completed_at: null,
      started_at: null,
    })
    .eq("id", params.job.id)
    .eq("organization_id", params.job.organization_id);

  if (jobError) {
    throw new Error(jobError.message || "Failed to update import job.");
  }

  return {
    rowCount: parsed.rows.length,
    headerCount: parsed.headers.length,
  };
}

async function loadJobRows(jobId: string): Promise<ImportJobRow[]> {
  const { data } = await supabase
    .from("import_job_rows")
    .select("*")
    .eq("job_id", jobId)
    .order("row_number", { ascending: true });
  return (data || []) as ImportJobRow[];
}
async function resolveProductsByIdentifiers(params: {
  organizationId: string;
  scins: string[];
  skus: string[];
}): Promise<{
  byScin: Map<string, ProductLookupRow>;
  bySku: Map<string, ProductLookupRow>;
}> {
  const products: ProductLookupRow[] = [];

  if (params.scins.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, scin, sku, family_id, product_name, type")
      .eq("organization_id", params.organizationId)
      .in("scin", params.scins);
    products.push(...((data || []) as ProductLookupRow[]));
  }

  if (params.skus.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, scin, sku, family_id, product_name, type")
      .eq("organization_id", params.organizationId)
      .in("sku", params.skus);
    products.push(...((data || []) as ProductLookupRow[]));
  }

  const byScin = new Map<string, ProductLookupRow>();
  const bySku = new Map<string, ProductLookupRow>();
  for (const product of products) {
    if (product.scin) byScin.set(product.scin, product);
    if (product.sku) bySku.set(product.sku, product);
  }
  return { byScin, bySku };
}

async function resolveFamiliesForRows(params: {
  organizationId: string;
  familyCodes: string[];
}): Promise<Map<string, FamilyRow>> {
  const normalized = Array.from(new Set(params.familyCodes.map((value) => normalizeCode(value)).filter(Boolean)));
  if (normalized.length === 0) return new Map();

  const { data } = await supabase
    .from("product_families")
    .select("id, code, name")
    .eq("organization_id", params.organizationId)
    .in("code", normalized);

  const map = new Map<string, FamilyRow>();
  for (const row of (data || []) as FamilyRow[]) {
    map.set(row.code, row);
  }
  return map;
}

async function resolveRequiredFamilyAttributes(params: {
  organizationId: string;
  familyIds: string[];
}): Promise<Map<string, FamilyAttributeRow[]>> {
  const uniqueFamilyIds = Array.from(new Set(params.familyIds.filter(Boolean)));
  if (uniqueFamilyIds.length === 0) return new Map();

  const { data } = await supabase
    .from("family_attributes")
    .select("family_id, attribute_code, attribute_label, attribute_type, is_required, display_order")
    .eq("organization_id", params.organizationId)
    .in("family_id", uniqueFamilyIds)
    .eq("is_required", true)
    .order("display_order", { ascending: true });

  const map = new Map<string, FamilyAttributeRow[]>();
  for (const row of (data || []) as FamilyAttributeRow[]) {
    const items = map.get(row.family_id) || [];
    items.push(row);
    map.set(row.family_id, items);
  }
  return map;
}

async function resolveAssets(params: {
  organizationId: string;
  assetIds: string[];
  assetRefs: string[];
}): Promise<{
  byId: Map<string, { id: string; asset_ref: string; filename: string }>;
  byRef: Map<string, { id: string; asset_ref: string; filename: string }>;
}> {
  const byId = new Map<string, { id: string; asset_ref: string; filename: string }>();
  const byRef = new Map<string, { id: string; asset_ref: string; filename: string }>();

  if (params.assetIds.length > 0) {
    const { data } = await supabase
      .from("dam_assets")
      .select("id, asset_ref, filename")
      .eq("organization_id", params.organizationId)
      .in("id", Array.from(new Set(params.assetIds)));

    for (const asset of (data || []) as Array<{ id: string; asset_ref: string; filename: string }>) {
      byId.set(asset.id, asset);
      byRef.set(asset.asset_ref, asset);
    }
  }

  if (params.assetRefs.length > 0) {
    const { data } = await supabase
      .from("dam_assets")
      .select("id, asset_ref, filename")
      .eq("organization_id", params.organizationId)
      .in("asset_ref", Array.from(new Set(params.assetRefs.map((value) => value.toUpperCase()))));

    for (const asset of (data || []) as Array<{ id: string; asset_ref: string; filename: string }>) {
      byId.set(asset.id, asset);
      byRef.set(asset.asset_ref, asset);
    }
  }

  return { byId, byRef };
}

function buildPreviewSummary(params: {
  rows: Array<{
    rowNumber: number;
    status: "valid" | "invalid";
    disposition: "update" | "create" | "delete" | null;
    assetUpdates: number;
    errors: string[];
  }>;
}): ValidationSummary {
  const summary: ValidationSummary = {
    totalRows: params.rows.length,
    validRows: 0,
    invalidRows: 0,
    updateRows: 0,
    createRows: 0,
    deleteRows: 0,
    assetLinkRows: 0,
    invalidPreview: [],
  };

  for (const row of params.rows) {
    if (row.status === "valid") {
      summary.validRows += 1;
      if (row.disposition === "update") summary.updateRows += 1;
      if (row.disposition === "create") summary.createRows += 1;
      if (row.disposition === "delete") summary.deleteRows += 1;
      if (row.assetUpdates > 0) summary.assetLinkRows += 1;
      continue;
    }
    summary.invalidRows += 1;
    if (summary.invalidPreview.length < 10) {
      summary.invalidPreview.push({
        rowNumber: row.rowNumber,
        errors: row.errors,
      });
    }
  }
  return summary;
}

export async function validateImportJob(job: ImportJob): Promise<ValidationSummary> {
  const rows = await loadJobRows(job.id);

  const template = await resolveTemplate({
    organizationId: job.organization_id,
    templateSource: job.template_source as TemplateSource,
    familyKey: job.family_id,
    channelKey: job.channel_id,
  });
  const fieldsByCode = new Map(template.fields.map((field) => [field.code, field]));

  const parsedRows = rows.map((row) => ({
    row,
    parsed: parseRowByCode(isRecord(row.raw_payload) ? (row.raw_payload as Record<string, string>) : {}),
  }));

  const scins = parsedRows
    .map(({ parsed }) => normalizeOptionalString(parsed.scin))
    .filter((value): value is string => Boolean(value));
  const skus = parsedRows
    .map(({ parsed }) => normalizeOptionalString(parsed.sku))
    .filter((value): value is string => Boolean(value));
  const parentScins = parsedRows
    .map(({ parsed }) => normalizeOptionalString(parsed.parent_scin))
    .filter((value): value is string => Boolean(value));
  const familyCodes = parsedRows
    .map(({ parsed }) => normalizeOptionalString(parsed.family_code))
    .filter((value): value is string => Boolean(value));

  const [{ byScin, bySku }, familyLookup, parentLookupByScin] = await Promise.all([
    resolveProductsByIdentifiers({
      organizationId: job.organization_id,
      scins,
      skus,
    }),
    resolveFamiliesForRows({
      organizationId: job.organization_id,
      familyCodes,
    }),
    resolveProductsByIdentifiers({
      organizationId: job.organization_id,
      scins: parentScins,
      skus: [],
    }).then((result) => result.byScin),
  ]);

  const familyIds = new Set<string>();
  if (job.family_id) familyIds.add(job.family_id);
  for (const family of familyLookup.values()) {
    familyIds.add(family.id);
  }
  const requiredFamilyAttributes = await resolveRequiredFamilyAttributes({
    organizationId: job.organization_id,
    familyIds: Array.from(familyIds),
  });

  const assetTokens = parsedRows.flatMap(({ parsed }) =>
    Object.entries(parsed)
      .filter(([code, value]) => {
        const field = fieldsByCode.get(code);
        return Boolean(field?.isAssetField && normalizeOptionalString(value));
      })
      .map(([, value]) => parseAssetReferenceValue(value))
  );
  const assets = await resolveAssets({
    organizationId: job.organization_id,
    assetIds: assetTokens.map((item) => item.assetId).filter((value): value is string => Boolean(value)),
    assetRefs: assetTokens.map((item) => item.assetRef).filter((value): value is string => Boolean(value)),
  });

  const rowUpdates: Array<Database["public"]["Tables"]["import_job_rows"]["Update"] & { id: string }> = [];
  const previewRows: Array<{
    rowNumber: number;
    status: "valid" | "invalid";
    disposition: "update" | "create" | "delete" | null;
    assetUpdates: number;
    errors: string[];
  }> = [];

  for (const { row, parsed } of parsedRows) {
    const errors: string[] = [];
    const scin = normalizeOptionalString(parsed.scin);
    const sku = normalizeOptionalString(parsed.sku);
    const familyCode = normalizeOptionalString(parsed.family_code);
    const productName = normalizeOptionalString(parsed.product_name);
    const resolvedFamily =
      (familyCode ? familyLookup.get(normalizeCode(familyCode)) || null : null) ||
      (template.family ? { id: template.family.id, code: template.family.code, name: template.family.name } : null);
    const createPayloadPresent = hasCreatePayload(parsed, resolvedFamily?.code || template.family?.code || null);

    const action = normalizeOptionalString(parsed.action);
    const scinMatch = scin ? byScin.get(scin) || null : null;
    const skuMatch = sku ? bySku.get(sku) || null : null;
    const disposition = resolveImportDisposition({
      intent: job.intent as ImportIntent,
      action,
      scin,
      sku,
      scinProductId: scinMatch?.id || null,
      skuProductId: skuMatch?.id || null,
      hasCreatePayload: createPayloadPresent,
    });

    if (disposition.kind === "invalid") {
      errors.push(disposition.reason);
    }
    if (!productName && disposition.kind === "create") {
      errors.push("Create rows require Product Name.");
    }
    if (disposition.kind === "create" && !resolvedFamily) {
      errors.push("Create rows require a valid family.");
    }

    const parentScin = normalizeOptionalString(parsed.parent_scin);
    const parentProduct = parentScin ? parentLookupByScin.get(parentScin) || null : null;
    if (parentScin && !parentProduct) {
      errors.push("Parent SCIN did not match an existing product.");
    }
    if (parentProduct && disposition.kind === "update") {
      const targetProduct = scinMatch || skuMatch;
      if (targetProduct?.type === "parent") {
        errors.push("Cannot reparent a product that has variants. Remove its variants first.");
      }
    }

    if (disposition.kind === "create" && resolvedFamily) {
      const requiredAttributes = requiredFamilyAttributes.get(resolvedFamily.id) || [];
      for (const attribute of requiredAttributes) {
        if (fieldBelongsToProductRow(attribute.attribute_code)) continue;
        if (!normalizeOptionalString(parsed[attribute.attribute_code])) {
          errors.push(`${attribute.attribute_label} is required for ${resolvedFamily.name}.`);
        }
      }
    }

    const fieldUpdates: Record<string, unknown> = {};
    const assetUpdates: NormalizedRowPayload["asset_updates"] = [];

    for (const [code, rawValue] of Object.entries(parsed)) {
      if (!rawValue || ["scin", "parent_scin", "family_code"].includes(code)) continue;
      const field = fieldsByCode.get(code);
      if (!field) continue;

      if (field.isAssetField) {
        const parsedAsset = parseAssetReferenceValue(rawValue);
        const asset =
          (parsedAsset.assetId ? assets.byId.get(parsedAsset.assetId) : null) ||
          (parsedAsset.assetRef ? assets.byRef.get(parsedAsset.assetRef) : null) ||
          null;
        if (!asset) {
          errors.push(`${field.label} could not resolve the referenced asset.`);
          continue;
        }
        assetUpdates.push({
          field_code: field.code,
          field_label: field.label,
          field_type: field.fieldType,
          product_field_id: template.fieldRowsByCode.get(field.code)?.id || null,
          asset_id: asset.id,
          asset_ref: asset.asset_ref,
        });
        continue;
      }

      fieldUpdates[code] = coerceValue(rawValue, field.fieldType);
    }

    const resolvedTargetProductId =
      disposition.kind === "update" || disposition.kind === "delete"
        ? disposition.targetProductId
        : null;

    const normalizedPayload: NormalizedRowPayload | null =
      errors.length === 0 && disposition.kind !== "invalid"
        ? {
            disposition: disposition.kind,
            target_product_id: resolvedTargetProductId,
            resolved_family_id: resolvedFamily?.id || null,
            resolved_family_code: resolvedFamily?.code || template.family?.code || null,
            resolved_channel_id: template.channel?.id || (job.channel_id || null),
            parent_product_id: parentProduct?.id || null,
            identifiers: {
              scin,
              sku,
              parent_scin: parentScin,
            },
            field_updates: fieldUpdates,
            asset_updates: assetUpdates,
          }
        : null;

    rowUpdates.push({
      id: row.id,
      identifier_scin: scin,
      identifier_sku: sku,
      resolved_product_id: resolvedTargetProductId,
      resolved_family_id: resolvedFamily?.id || null,
      resolved_channel_id: template.channel?.id || job.channel_id || null,
      status: errors.length === 0 && disposition.kind !== "invalid" ? "valid" : "invalid",
      normalized_payload: normalizedPayload ? toNormalizedRowJson(normalizedPayload) : {},
      result: {
        disposition: disposition.kind === "invalid" ? null : disposition.kind,
        asset_update_count: assetUpdates.length,
      },
      errors: serializeErrors(errors),
    });

    previewRows.push({
      rowNumber: row.row_number,
      status: errors.length === 0 && disposition.kind !== "invalid" ? "valid" : "invalid",
      disposition: disposition.kind === "invalid" ? null : disposition.kind,
      assetUpdates: assetUpdates.length,
      errors,
    });
  }

  for (const update of rowUpdates) {
    const { id, ...payload } = update;
    const { error } = await supabase.from("import_job_rows").update(payload).eq("id", id);
    if (error) {
      throw new Error(error.message || "Failed to persist row validation results.");
    }
  }

  const summary = buildPreviewSummary({ rows: previewRows });
  const status = summary.invalidRows === 0 ? "ready" : summary.validRows > 0 ? "ready" : "failed";

  const { error: jobError } = await supabase
    .from("import_jobs")
    .update({
      status,
      failed_row_count: summary.invalidRows,
      summary: {
        validation: summary,
        template_field_hash: hashFieldSet(template.fields),
      },
      error_summary:
        summary.invalidRows > 0 && summary.validRows === 0
          ? "Every row failed validation."
          : null,
    })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id);

  if (jobError) {
    throw new Error(jobError.message || "Failed to update validation summary.");
  }

  return summary;
}
async function callInternalJson(params: {
  request: NextRequest;
  path: string;
  method: "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const response = await fetch(new URL(params.path, params.request.url), {
    method: params.method,
    headers: {
      "Content-Type": "application/json",
      cookie: params.request.headers.get("cookie") || "",
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : `Request to ${params.path} failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function runImportJob(params: {
  request: NextRequest;
  tenant: string;
  job: ImportJob;
}): Promise<{ appliedRows: number; failedRows: number }> {
  const rows = await loadJobRows(params.job.id);
  const validRows = rows.filter((row) => row.status === "valid");
  const scope = normalizeImportScope(params.job.scope);

  await supabase
    .from("import_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      completed_at: null,
      error_summary: null,
    })
    .eq("id", params.job.id)
    .eq("organization_id", params.job.organization_id);

  let appliedRows = 0;
  let failedRows = 0;

  for (const row of validRows) {
    const normalized = isRecord(row.normalized_payload) ? (row.normalized_payload as unknown as NormalizedRowPayload) : null;
    if (!normalized) {
      failedRows += 1;
      await supabase
        .from("import_job_rows")
        .update({ status: "failed", errors: ["Missing normalized payload."] })
        .eq("id", row.id);
      continue;
    }

    try {
      let productId = normalized.target_product_id;
      const rowUpdates = normalized.field_updates || {};
      const rowFieldPayload: Record<string, unknown> = {};
      const customFieldPayload: Record<string, unknown> = {};

      for (const [code, value] of Object.entries(rowUpdates)) {
        if (fieldBelongsToProductRow(code)) {
          rowFieldPayload[code] = value;
        } else {
          customFieldPayload[code] = value;
        }
      }

      if (normalized.disposition === "delete") {
        if (!productId) {
          throw new Error("Delete row is missing a resolved product ID.");
        }
        await callInternalJson({
          request: params.request,
          path: `/api/${params.tenant}/products/${productId}`,
          method: "DELETE",
        });
        appliedRows += 1;
        await supabase
          .from("import_job_rows")
          .update({
            status: "applied",
            resolved_product_id: productId,
            result: { applied_at: new Date().toISOString(), action: "delete" },
            errors: [],
          })
          .eq("id", row.id);
        continue;
      }

      if (normalized.disposition === "create") {
        const createBody: Record<string, unknown> = {
          type: normalized.parent_product_id ? "variant" : "standalone",
          parent_id: normalized.parent_product_id,
          family_id: normalized.resolved_family_id,
          product_name: rowFieldPayload.product_name,
          sku: rowFieldPayload.sku ?? normalized.identifiers.sku,
          barcode: rowFieldPayload.barcode ?? null,
          status: rowFieldPayload.status ?? "Draft",
          brand_line: rowFieldPayload.brand_line ?? null,
          short_description: rowFieldPayload.short_description ?? null,
          long_description: rowFieldPayload.long_description ?? null,
          features: rowFieldPayload.features ?? [],
          meta_title: rowFieldPayload.meta_title ?? null,
          meta_description: rowFieldPayload.meta_description ?? null,
          keywords: rowFieldPayload.keywords ?? [],
          weight_g: rowFieldPayload.weight_g ?? null,
        };
        const created = await callInternalJson({
          request: params.request,
          path: `/api/${params.tenant}/products`,
          method: "POST",
          body: createBody,
        });
        const productData = isRecord(created.data) ? created.data : {};
        productId = normalizeOptionalString(productData.id);
      } else if (productId) {
        const updateBody: Record<string, unknown> = { ...rowFieldPayload };
        if (normalized.parent_product_id) {
          updateBody.parent_id = normalized.parent_product_id;
          updateBody.type = "variant";
        }
        if (Object.keys(updateBody).length > 0) {
          const search = scopeToSearchParams(scope).toString();
          await callInternalJson({
            request: params.request,
            path: `/api/${params.tenant}/products/${productId}${search ? `?${search}` : ""}`,
            method: "PUT",
            body: updateBody,
          });
        }
      }

      if (!productId) {
        throw new Error("Import row could not resolve a product target.");
      }

      if (Object.keys(customFieldPayload).length > 0) {
        const search = scopeToSearchParams(scope).toString();
        await callInternalJson({
          request: params.request,
          path: `/api/${params.tenant}/products/${productId}${search ? `?${search}` : ""}`,
          method: "PUT",
          body: customFieldPayload,
        });
      }

      for (const assetUpdate of normalized.asset_updates || []) {
        if (!assetUpdate.asset_id) continue;
        await callInternalJson({
          request: params.request,
          path: `/api/${params.tenant}/product-links`,
          method: "POST",
          body: {
            product_id: productId,
            asset_id: assetUpdate.asset_id,
            asset_type: assetUpdate.field_type === "image" ? "image" : "document",
            link_context: "product_import",
            product_field_id: assetUpdate.product_field_id,
            document_slot_code: assetUpdate.field_code,
            channel_id: scope.channelId,
            market_id: scope.marketId,
            locale_id: scope.localeId,
            destination_id: scope.destinationId,
            replace_existing_slot: true,
          },
        });
      }

      appliedRows += 1;
      await supabase
        .from("import_job_rows")
        .update({
          status: "applied",
          resolved_product_id: productId,
          result: {
            applied_at: new Date().toISOString(),
            asset_update_count: normalized.asset_updates?.length || 0,
          },
          errors: [],
        })
        .eq("id", row.id);
    } catch (error) {
      failedRows += 1;
      await supabase
        .from("import_job_rows")
        .update({
          status: "failed",
          errors: [error instanceof Error ? error.message : "Import row failed."],
        })
        .eq("id", row.id);
    }
  }

  const finalStatus: ImportJob["status"] =
    appliedRows > 0 && failedRows > 0 ? "partial" : failedRows > 0 ? "failed" : "completed";

  await supabase
    .from("import_jobs")
    .update({
      status: finalStatus,
      applied_row_count: appliedRows,
      failed_row_count: failedRows,
      completed_at: new Date().toISOString(),
      error_summary: failedRows > 0 ? `${failedRows} row(s) failed during import.` : null,
    })
    .eq("id", params.job.id)
    .eq("organization_id", params.job.organization_id);

  return { appliedRows, failedRows };
}

export async function getImportJobDetail(organizationId: string, jobId: string): Promise<{
  job: ImportJob | null;
  rows: ImportJobRow[];
}> {
  const [job, rows] = await Promise.all([getImportJob(organizationId, jobId), loadJobRows(jobId)]);
  if (!job) {
    return { job: null, rows: [] };
  }
  return { job, rows };
}

export function buildErrorCsv(rows: ImportJobRow[]): string {
  const headers = ["Row Number", "Status", "SCIN", "SKU", "Errors"];
  const data = rows
    .filter((row) => row.status === "invalid" || row.status === "failed")
    .map((row) => {
      const errors = Array.isArray(row.errors) ? row.errors.join("; ") : "";
      return [row.row_number, row.status, row.identifier_scin || "", row.identifier_sku || "", errors];
    });
  return buildCsv(headers, data);
}

export function buildTemplateDownload(fields: TemplateFieldDefinition[]): {
  csv: string;
  columns: Array<{ header: string; code: string; required: boolean; fieldType: string }>;
} {
  return {
    csv: buildTemplateCsv(fields),
    columns: fields.map((field) => ({
      header: `${field.label} [${field.code}]`,
      code: field.code,
      required: field.isRequired,
      fieldType: field.fieldType,
    })),
  };
}
