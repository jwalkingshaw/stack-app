import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseServer } from "@/lib/supabase";
import { isMissingLocalizationFoundationError, requireLocalizationAccess } from "../../../../../_shared";

type ItemStatus =
  | "queued"
  | "generated"
  | "reviewed"
  | "approved"
  | "rejected"
  | "applied"
  | "failed"
  | "stale";

type JobStatus = "queued" | "running" | "review_required" | "completed" | "failed" | "cancelled";

type TranslationJobItemDetail = {
  id: string;
  job_id: string;
  organization_id: string;
  product_id: string;
  product_field_id: string | null;
  field_code: string;
  status: ItemStatus;
  source_value: Record<string, unknown> | null;
  suggested_value: Record<string, unknown> | null;
  edited_value: Record<string, unknown> | null;
  final_value: Record<string, unknown> | null;
  source_scope: Record<string, unknown> | null;
  target_scope: Record<string, unknown> | null;
  source_hash: string;
};

type ProductFieldRow = {
  id: string;
  code: string;
  field_type: string;
  organization_id: string;
};

const ITEM_SELECT = `
  id,
  job_id,
  organization_id,
  product_id,
  product_field_id,
  field_code,
  status,
  source_value,
  suggested_value,
  edited_value,
  final_value,
  source_scope,
  target_scope,
  source_hash
`;

const SYSTEM_PRODUCT_FIELD_MAP: Record<string, string> = {
  product_name: "product_name",
  short_description: "short_description",
  long_description: "long_description",
  meta_title: "meta_title",
  meta_description: "meta_description",
  features: "features",
};

const SYSTEM_TO_PRODUCT_FIELD_CODE_CANDIDATES: Record<string, string[]> = {
  product_name: ["title", "product_name"],
  short_description: ["short_description"],
  long_description: ["long_description", "description"],
  features: ["features", "bullet_points", "bullets"],
  meta_title: ["meta_title", "seo_title"],
  meta_description: ["meta_description", "seo_description"],
};

function normalizeValueText(input: unknown): string {
  if (typeof input === "string") {
    return input.trim();
  }

  if (input && typeof input === "object" && !Array.isArray(input)) {
    const text = (input as Record<string, unknown>).text;
    if (typeof text === "string") {
      return text.trim();
    }
  }

  return "";
}

function toFeaturesValue(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function getPreferredFinalText(item: TranslationJobItemDetail): string {
  return (
    normalizeValueText(item.final_value) ||
    normalizeValueText(item.edited_value) ||
    normalizeValueText(item.suggested_value)
  );
}

function toSourceHash(params: {
  fieldCode: string;
  sourceText: string;
  productFieldId: string | null;
}): string {
  return createHash("sha256")
    .update(`${params.productFieldId || "system"}::${params.fieldCode}::${params.sourceText}`)
    .digest("hex");
}

function extractScopeId(scope: Record<string, unknown> | null, key: string): string | null {
  if (!scope) return null;
  const value = scope[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveSystemFieldText(params: {
  fieldCode: string;
  product: {
    product_name: string | null;
    short_description: string | null;
    long_description: string | null;
    features: unknown;
    meta_title: string | null;
    meta_description: string | null;
  };
}): string | null {
  const { fieldCode, product } = params;
  const toText = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (Array.isArray(value)) {
      const values = value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0);
      return values.length > 0 ? values.join("\n") : null;
    }
    if (value && typeof value === "object") {
      const values = Object.values(value as Record<string, unknown>)
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0);
      return values.length > 0 ? values.join("\n") : null;
    }
    return null;
  };

  switch (fieldCode) {
    case "product_name":
      return toText(product.product_name);
    case "short_description":
      return toText(product.short_description);
    case "long_description":
      return toText(product.long_description);
    case "features":
      return toText(product.features);
    case "meta_title":
      return toText(product.meta_title);
    case "meta_description":
      return toText(product.meta_description);
    default:
      return null;
  }
}

function scoreScopeMatch(params: {
  row: {
    market_id: string | null;
    channel_id: string | null;
    destination_id: string | null;
    locale_id: string | null;
  };
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  sourceLocaleId: string | null;
}): number {
  const scoreDimension = (
    actual: string | null,
    expected: string | null,
    weight: number
  ): number => {
    if (expected) {
      if (actual === expected) return weight;
      if (actual === null) return 1;
      return -1000;
    }
    if (actual === null) return 2;
    return -1000;
  };

  return (
    scoreDimension(params.row.market_id, params.sourceMarketId, 32) +
    scoreDimension(params.row.channel_id, params.sourceChannelId, 24) +
    scoreDimension(params.row.destination_id, params.sourceDestinationId, 16) +
    scoreDimension(params.row.locale_id, params.sourceLocaleId, 24)
  );
}

function toRowText(row: {
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_datetime: string | null;
  value_json: unknown;
}): string | null {
  const value =
    row.value_text ??
    row.value_number ??
    row.value_boolean ??
    row.value_date ??
    row.value_datetime ??
    row.value_json;
  return normalizeValueText(value);
}

function pickBestScopedText(params: {
  rows: Array<{
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
  }>;
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  sourceLocaleId: string | null;
}): string | null {
  const ranked = params.rows
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

  for (const entry of ranked) {
    const text = toRowText(entry.row);
    if (text) return text;
  }
  return null;
}

async function resolveCurrentSourceText(item: TranslationJobItemDetail): Promise<string | null> {
  const sourceMarketId = extractScopeId(item.source_scope, "marketId");
  const sourceChannelId = extractScopeId(item.source_scope, "channelId");
  const sourceDestinationId = extractScopeId(item.source_scope, "destinationId");
  const sourceLocaleId = extractScopeId(item.source_scope, "localeId");

  if (item.product_field_id) {
    const { data: valueRows, error: valuesError } = await (supabaseServer as any)
      .from("product_field_values")
      .select(
        "value_text,value_number,value_boolean,value_date,value_datetime,value_json,market_id,channel_id,destination_id,locale_id"
      )
      .eq("organization_id", item.organization_id)
      .eq("product_id", item.product_id)
      .eq("product_field_id", item.product_field_id);

    if (valuesError) {
      console.error("Failed to resolve current source value for stale check:", valuesError);
      return null;
    }

    const direct = pickBestScopedText({
      rows: (valueRows || []) as any[],
      sourceMarketId,
      sourceChannelId,
      sourceDestinationId,
      sourceLocaleId,
    });
    if (direct) return direct;

    const { data: productRow } = await (supabaseServer as any)
      .from("products")
      .select("type,parent_id")
      .eq("organization_id", item.organization_id)
      .eq("id", item.product_id)
      .maybeSingle();
    const parentId =
      productRow?.type === "variant" &&
      typeof productRow?.parent_id === "string" &&
      productRow.parent_id.trim().length > 0
        ? productRow.parent_id.trim()
        : null;
    if (!parentId) return null;

    const { data: parentRows, error: parentRowsError } = await (supabaseServer as any)
      .from("product_field_values")
      .select(
        "value_text,value_number,value_boolean,value_date,value_datetime,value_json,market_id,channel_id,destination_id,locale_id"
      )
      .eq("organization_id", item.organization_id)
      .eq("product_id", parentId)
      .eq("product_field_id", item.product_field_id);

    if (parentRowsError) {
      console.error("Failed to resolve parent source value for stale check:", parentRowsError);
      return null;
    }

    return pickBestScopedText({
      rows: (parentRows || []) as any[],
      sourceMarketId,
      sourceChannelId,
      sourceDestinationId,
      sourceLocaleId,
    });
  }

  const { data: productRow, error: productError } = await (supabaseServer as any)
    .from("products")
    .select(
      "type,parent_id,product_name,short_description,long_description,features,meta_title,meta_description"
    )
    .eq("organization_id", item.organization_id)
    .eq("id", item.product_id)
    .maybeSingle();

  if (productError) {
    console.error("Failed to resolve product for stale check:", productError);
    return null;
  }
  if (!productRow) return null;

  let sourceText = resolveSystemFieldText({
    fieldCode: item.field_code,
    product: productRow,
  });

  if (!sourceText && productRow.type === "variant" && productRow.parent_id) {
    const { data: parentRow, error: parentError } = await (supabaseServer as any)
      .from("products")
      .select("product_name,short_description,long_description,features,meta_title,meta_description")
      .eq("organization_id", item.organization_id)
      .eq("id", productRow.parent_id)
      .maybeSingle();

    if (!parentError && parentRow) {
      sourceText = resolveSystemFieldText({
        fieldCode: item.field_code,
        product: parentRow,
      });
    }
  }

  return sourceText;
}

async function resolveLocaleCodeById(localeId: string): Promise<string | null> {
  const { data, error } = await (supabaseServer as any)
    .from("locales")
    .select("code")
    .eq("id", localeId)
    .maybeSingle();
  if (error) {
    console.error("Failed to resolve locale code:", error);
    return null;
  }
  const code = data?.code;
  return typeof code === "string" && code.trim().length > 0 ? code.trim() : null;
}

async function resolveChannelCodeById(channelId: string): Promise<string | null> {
  const { data, error } = await (supabaseServer as any)
    .from("channels")
    .select("code")
    .eq("id", channelId)
    .maybeSingle();
  if (error) {
    console.error("Failed to resolve channel code:", error);
    return null;
  }
  const code = data?.code;
  return typeof code === "string" && code.trim().length > 0 ? code.trim() : null;
}

async function resolveProductField(params: {
  organizationId: string;
  productFieldId: string | null;
  fieldCode: string;
}): Promise<ProductFieldRow | null> {
  if (params.productFieldId) {
    const { data, error } = await (supabaseServer as any)
      .from("product_fields")
      .select("id,code,field_type,organization_id")
      .eq("organization_id", params.organizationId)
      .eq("id", params.productFieldId)
      .maybeSingle();
    if (error) {
      console.error("Failed to load product field by id:", error);
      return null;
    }
    if (data) return data as ProductFieldRow;
  }

  const candidates = SYSTEM_TO_PRODUCT_FIELD_CODE_CANDIDATES[params.fieldCode] || [params.fieldCode];
  for (const codeCandidate of candidates) {
    const { data, error } = await (supabaseServer as any)
      .from("product_fields")
      .select("id,code,field_type,organization_id")
      .eq("organization_id", params.organizationId)
      .eq("code", codeCandidate)
      .maybeSingle();
    if (error) {
      console.error("Failed to load product field by code:", error);
      continue;
    }
    if (data) {
      return data as ProductFieldRow;
    }
  }

  return null;
}

async function upsertProductFieldValue(params: {
  organizationId: string;
  productId: string;
  productField: ProductFieldRow;
  textValue: string;
  scope: Record<string, unknown> | null;
}): Promise<{ ok: boolean; error?: string }> {
  const targetScope = params.scope || {};
  const marketId = extractScopeId(targetScope, "marketId");
  const channelId = extractScopeId(targetScope, "channelId");
  const localeId = extractScopeId(targetScope, "localeId");
  const destinationId = extractScopeId(targetScope, "destinationId");

  let localeCode: string | null = null;
  let channelCode: string | null = null;
  if (localeId) {
    localeCode = await resolveLocaleCodeById(localeId);
  }
  if (channelId) {
    channelCode = await resolveChannelCodeById(channelId);
  }

  const { data: existing, error: existingError } = await (supabaseServer as any)
    .from("product_field_values")
    .select("id")
    .eq("product_id", params.productId)
    .eq("product_field_id", params.productField.id)
    .is("market_id", marketId)
    .is("channel_id", channelId)
    .is("locale_id", localeId)
    .is("destination_id", destinationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("Failed to resolve existing product_field_values row:", existingError);
    return { ok: false, error: "Failed to resolve existing scoped product field value" };
  }

  const updatePayload = {
    value_text: params.textValue,
    value_number: null,
    value_boolean: null,
    value_date: null,
    value_datetime: null,
    value_json: null,
    locale: localeCode,
    channel: channelCode,
    locale_id: localeId,
    channel_id: channelId,
    market_id: marketId,
    destination_id: destinationId,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: updateError } = await (supabaseServer as any)
      .from("product_field_values")
      .update(updatePayload)
      .eq("id", existing.id);

    if (updateError) {
      console.error("Failed to update product_field_values row:", updateError);
      return { ok: false, error: "Failed to update scoped product field value" };
    }
    return { ok: true };
  }

  const { error: insertError } = await (supabaseServer as any).from("product_field_values").insert({
    product_id: params.productId,
    product_field_id: params.productField.id,
    ...updatePayload,
  });

  if (insertError) {
    console.error("Failed to insert product_field_values row:", insertError);
    return { ok: false, error: "Failed to create scoped product field value" };
  }

  return { ok: true };
}

function hasScopedTargetScope(scope: Record<string, unknown> | null): boolean {
  if (!scope) return false;
  return Boolean(
    extractScopeId(scope, "marketId") ||
      extractScopeId(scope, "channelId") ||
      extractScopeId(scope, "localeId") ||
      extractScopeId(scope, "destinationId")
  );
}

async function applyToCoreProductColumn(params: {
  organizationId: string;
  productId: string;
  fieldCode: string;
  textValue: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const systemProductColumn = SYSTEM_PRODUCT_FIELD_MAP[params.fieldCode];
  if (!systemProductColumn) {
    return { ok: false, error: "No mapped core product column for this field code" };
  }

  const payload =
    systemProductColumn === "features"
      ? { features: toFeaturesValue(params.textValue), last_modified_by: params.userId }
      : { [systemProductColumn]: params.textValue, last_modified_by: params.userId };

  const { error } = await (supabaseServer as any)
    .from("products")
    .update(payload)
    .eq("organization_id", params.organizationId)
    .eq("id", params.productId);

  if (error) {
    console.error("Failed to apply translation value to products row:", error);
    return { ok: false, error: "Failed to apply item to product value" };
  }

  return { ok: true };
}

async function refreshJobStatus(params: {
  organizationId: string;
  jobId: string;
}): Promise<void> {
  const { data: itemRows, error: itemError } = await (supabaseServer as any)
    .from("translation_job_items")
    .select("status")
    .eq("organization_id", params.organizationId)
    .eq("job_id", params.jobId);

  if (itemError) {
    console.error("Failed to refresh job status (item fetch):", itemError);
    return;
  }

  const statuses = ((itemRows || []) as Array<{ status: ItemStatus }>).map((row) => row.status);
  if (statuses.length === 0) return;

  const counts = statuses.reduce(
    (acc, status) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  let nextStatus: JobStatus = "review_required";
  if ((counts.failed || 0) === statuses.length) {
    nextStatus = "failed";
  } else if ((counts.applied || 0) === statuses.length) {
    nextStatus = "completed";
  } else if ((counts.rejected || 0) === statuses.length) {
    nextStatus = "completed";
  } else if ((counts.queued || 0) > 0 || (counts.generated || 0) > 0 || (counts.reviewed || 0) > 0) {
    nextStatus = "review_required";
  } else if ((counts.approved || 0) > 0 || (counts.stale || 0) > 0) {
    nextStatus = "review_required";
  }

  const completedAt =
    nextStatus === "completed" || nextStatus === "failed" ? new Date().toISOString() : null;

  const { error: updateError } = await (supabaseServer as any)
    .from("translation_jobs")
    .update({
      status: nextStatus,
      completed_at: completedAt,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.jobId);

  if (updateError) {
    console.error("Failed to refresh job status (job update):", updateError);
  }
}

// POST /api/[tenant]/localization/jobs/[jobId]/items/[itemId]/apply
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; jobId: string; itemId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(_request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const { data: item, error: itemError } = await (supabaseServer as any)
      .from("translation_job_items")
      .select(ITEM_SELECT)
      .eq("organization_id", organization.id)
      .eq("job_id", resolved.jobId)
      .eq("id", resolved.itemId)
      .maybeSingle();

    if (itemError) {
      if (isMissingLocalizationFoundationError(itemError)) {
        return NextResponse.json(
          { error: "Localization foundation is unavailable. Apply Phase D migrations first." },
          { status: 503 }
        );
      }
      console.error("Failed to load translation job item:", itemError);
      return NextResponse.json({ error: "Failed to load translation job item" }, { status: 500 });
    }

    if (!item) {
      return NextResponse.json({ error: "Translation job item not found" }, { status: 404 });
    }

    const itemRow = item as TranslationJobItemDetail;
    if (itemRow.status === "applied") {
      return NextResponse.json({ success: true, message: "Item already applied." });
    }
    if (itemRow.status === "rejected" || itemRow.status === "failed") {
      return NextResponse.json({ error: `Cannot apply item with status '${itemRow.status}'.` }, { status: 409 });
    }

    const finalText = getPreferredFinalText(itemRow);
    if (!finalText) {
      return NextResponse.json(
        { error: "No final/suggested text value exists to apply for this item." },
        { status: 400 }
      );
    }

    const currentSourceText = await resolveCurrentSourceText(itemRow);
    const currentSourceHash = currentSourceText
      ? toSourceHash({
          fieldCode: itemRow.field_code,
          sourceText: currentSourceText,
          productFieldId: itemRow.product_field_id,
        })
      : null;
    const legacySourceHash =
      currentSourceText && !itemRow.product_field_id
        ? createHash("sha256").update(`${itemRow.field_code}::${currentSourceText}`).digest("hex")
        : null;

    if (
      !currentSourceHash ||
      (currentSourceHash !== itemRow.source_hash && legacySourceHash !== itemRow.source_hash)
    ) {
      const staleError = "Source content changed since this suggestion was generated. Regenerate before applying.";
      await (supabaseServer as any)
        .from("translation_job_items")
        .update({
          status: "stale",
          error_message: staleError,
        })
        .eq("organization_id", organization.id)
        .eq("job_id", resolved.jobId)
        .eq("id", resolved.itemId);

      await refreshJobStatus({ organizationId: organization.id, jobId: resolved.jobId });
      return NextResponse.json({ error: staleError, code: "SOURCE_STALE" }, { status: 409 });
    }

    const isScopedApply = hasScopedTargetScope(itemRow.target_scope);
    const productField = await resolveProductField({
      organizationId: organization.id,
      productFieldId: itemRow.product_field_id,
      fieldCode: itemRow.field_code,
    });

    if (isScopedApply && productField) {
      const valueWriteResult = await upsertProductFieldValue({
        organizationId: organization.id,
        productId: itemRow.product_id,
        productField,
        textValue: finalText,
        scope: itemRow.target_scope,
      });

      if (!valueWriteResult.ok) {
        return NextResponse.json(
          { error: valueWriteResult.error || "Failed to write scoped field value" },
          { status: 500 }
        );
      }
    } else if (isScopedApply && !productField) {
      return NextResponse.json(
        { error: "Could not resolve product field for scoped apply. Configure a matching translatable field first." },
        { status: 404 }
      );
    } else if (!isScopedApply && productField && !SYSTEM_PRODUCT_FIELD_MAP[itemRow.field_code]) {
      const valueWriteResult = await upsertProductFieldValue({
        organizationId: organization.id,
        productId: itemRow.product_id,
        productField,
        textValue: finalText,
        scope: itemRow.target_scope,
      });

      if (!valueWriteResult.ok) {
        return NextResponse.json(
          { error: valueWriteResult.error || "Failed to write scoped field value" },
          { status: 500 }
        );
      }
    } else {
      const coreWriteResult = await applyToCoreProductColumn({
        organizationId: organization.id,
        productId: itemRow.product_id,
        fieldCode: itemRow.field_code,
        textValue: finalText,
        userId,
      });

      if (!coreWriteResult.ok) {
        return NextResponse.json(
          { error: coreWriteResult.error || "Failed to apply item to product value" },
          { status: 500 }
        );
      }
    }

    const appliedAt = new Date().toISOString();
    const finalValue = { text: finalText };
    const { error: itemUpdateError } = await (supabaseServer as any)
      .from("translation_job_items")
      .update({
        status: "applied",
        final_value: finalValue,
        applied_by: userId,
        applied_at: appliedAt,
        error_message: null,
      })
      .eq("organization_id", organization.id)
      .eq("job_id", resolved.jobId)
      .eq("id", resolved.itemId);

    if (itemUpdateError) {
      console.error("Failed to mark translation item as applied:", itemUpdateError);
      return NextResponse.json({ error: "Failed to finalize apply operation" }, { status: 500 });
    }

    await refreshJobStatus({ organizationId: organization.id, jobId: resolved.jobId });

    return NextResponse.json({
      success: true,
      data: {
        itemId: itemRow.id,
        status: "applied",
      },
    });
  } catch (error) {
    console.error("Error in translation job item apply POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
