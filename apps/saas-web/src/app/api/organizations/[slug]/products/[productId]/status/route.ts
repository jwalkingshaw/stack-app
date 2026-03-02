import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { applyRLSContext } from "@/lib/rls-context";
import { evaluateProductCompleteness } from "@/lib/family-attributes";
import { getChannelScopedProductIds, resolveProductChannelScope } from "@/lib/product-channel-scope";
import { assertBillingCapacity, isBillableSkuRecord } from "@/lib/billing-policy";

const ALLOWED_STATUS = [
  "Draft",
  "Enrichment",
  "Review",
  "Active",
  "Discontinued",
  "Archived",
] as const;

type ProductStatus = (typeof ALLOWED_STATUS)[number];

const isProductStatus = (value: string): value is ProductStatus =>
  (ALLOWED_STATUS as readonly string[]).includes(value);

const scopeSpecificity = (rule: {
  channel_id: string | null;
  market_id: string | null;
  destination_id: string | null;
  locale_id: string | null;
}): number => {
  let score = 0;
  if (rule.channel_id) score += 1;
  if (rule.market_id) score += 1;
  if (rule.destination_id) score += 1;
  if (rule.locale_id) score += 1;
  return score;
};

const enforcementRank = (value: string | null | undefined): number => {
  if (value === "required") return 3;
  if (value === "recommended") return 2;
  if (value === "none") return 1;
  return 0;
};

const hasDocumentValue = (value: any): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== "object") return true;

  const assetId = value.assetId || value.id || value.asset_id;
  const url = value.url || value.s3Url || value.s3_url;
  if (assetId || url) return true;

  return Object.keys(value).length > 0;
};

async function evaluateRequiredDocumentRules(params: {
  organizationId: string;
  productId: string;
  familyId: string | null;
  channelId: string | null;
  marketId: string | null;
  destinationId: string | null;
  localeId: string | null;
}) {
  if (!params.familyId) {
    return { missingDocuments: [] as Array<{ code: string; label: string }> };
  }

  const { data: rawRules, error: rulesError } = await (supabaseServer as any)
    .from("product_family_document_rules")
    .select(
      "product_field_id,enforcement_level,channel_id,market_id,destination_id,locale_id"
    )
    .eq("organization_id", params.organizationId)
    .eq("product_family_id", params.familyId)
    .eq("is_active", true);

  if (rulesError) {
    if (rulesError.code === "42P01") {
      // Migration not applied yet.
      return { missingDocuments: [] as Array<{ code: string; label: string }> };
    }
    throw rulesError;
  }

  const matchingRules = ((rawRules || []) as Array<any>).filter((rule) => {
    if (rule.channel_id && rule.channel_id !== params.channelId) return false;
    if (rule.market_id && rule.market_id !== params.marketId) return false;
    if (rule.destination_id && rule.destination_id !== params.destinationId) return false;
    if (rule.locale_id && rule.locale_id !== params.localeId) return false;
    return true;
  });

  const effectiveRules = new Map<
    string,
    {
      product_field_id: string;
      enforcement_level: string;
      channel_id: string | null;
      market_id: string | null;
      destination_id: string | null;
      locale_id: string | null;
    }
  >();

  for (const rule of matchingRules) {
    const key = String(rule.product_field_id || "");
    if (!key) continue;

    const existing = effectiveRules.get(key);
    if (!existing) {
      effectiveRules.set(key, rule);
      continue;
    }

    const existingScope = scopeSpecificity(existing);
    const nextScope = scopeSpecificity(rule);

    if (nextScope > existingScope) {
      effectiveRules.set(key, rule);
      continue;
    }

    if (nextScope === existingScope) {
      if (enforcementRank(rule.enforcement_level) > enforcementRank(existing.enforcement_level)) {
        effectiveRules.set(key, rule);
      }
    }
  }

  const requiredFieldIds = Array.from(effectiveRules.values())
    .filter((rule) => rule.enforcement_level === "required")
    .map((rule) => String(rule.product_field_id));

  if (requiredFieldIds.length === 0) {
    return { missingDocuments: [] as Array<{ code: string; label: string }> };
  }

  const { data: requiredFields, error: requiredFieldsError } = await (supabaseServer as any)
    .from("product_fields")
    .select("id,code,name")
    .eq("organization_id", params.organizationId)
    .in("id", requiredFieldIds);

  if (requiredFieldsError) {
    throw requiredFieldsError;
  }

  const fieldMeta = new Map<string, { code: string; label: string }>();
  (requiredFields || []).forEach((field: any) => {
    fieldMeta.set(String(field.id), {
      code: String(field.code || ""),
      label: String(field.name || field.code || "Document"),
    });
  });

  const { data: rawValues, error: valuesError } = await (supabaseServer as any)
    .from("product_field_values")
    .select(
      "product_field_id,value_text,value_number,value_boolean,value_date,value_datetime,value_json"
    )
    .eq("product_id", params.productId)
    .in("product_field_id", requiredFieldIds);

  if (valuesError) {
    throw valuesError;
  }

  const valueByFieldId = new Map<string, any[]>();
  (rawValues || []).forEach((row: any) => {
    const fieldId = String(row.product_field_id || "");
    if (!fieldId) return;

    const normalizedValue =
      row.value_json ??
      row.value_text ??
      row.value_number ??
      row.value_boolean ??
      row.value_date ??
      row.value_datetime;

    const current = valueByFieldId.get(fieldId) || [];
    current.push(normalizedValue);
    valueByFieldId.set(fieldId, current);
  });

  // DAM link fallback when product-field values are not yet persisted.
  try {
    const { data: linkedDocs, error: linkedDocsError } = await (supabaseServer as any)
      .from("product_asset_links")
      .select("product_field_id,asset_id")
      .eq("organization_id", params.organizationId)
      .eq("product_id", params.productId)
      .eq("is_active", true)
      .in("product_field_id", requiredFieldIds);

    if (!linkedDocsError) {
      (linkedDocs || []).forEach((row: any) => {
        const fieldId = String(row.product_field_id || "");
        if (!fieldId) return;
        if (!row.asset_id) return;
        const current = valueByFieldId.get(fieldId) || [];
        current.push({ assetId: row.asset_id });
        valueByFieldId.set(fieldId, current);
      });
    }
  } catch {
    // Ignore fallback failures for compatibility with older schemas.
  }

  const missingDocuments: Array<{ code: string; label: string }> = [];
  requiredFieldIds.forEach((fieldId) => {
    const candidates = valueByFieldId.get(fieldId) || [];
    const isPresent = candidates.some((candidate) => hasDocumentValue(candidate));
    if (!isPresent) {
      const meta = fieldMeta.get(fieldId);
      missingDocuments.push({
        code: meta?.code || fieldId,
        label: meta?.label || "Required document",
      });
    }
  });

  return { missingDocuments };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; productId: string }> }
) {
  try {
    const { slug, productId } = await params;
    const payload = await request.json();
    const marketId = payload?.marketId ?? null;
    const channelId = payload?.channelId ?? null;
    const destinationId = payload?.destinationId ?? null;
    const localeId = payload?.localeId ?? null;

    const status = payload?.status;
    if (typeof status !== "string" || !isProductStatus(status)) {
      return NextResponse.json(
        { error: "Invalid product status" },
        { status: 400 }
      );
    }

    const db = new DatabaseQueries(supabaseServer);
    const auth = new AuthService(db);

    const user = await auth.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await auth.getCurrentOrganization(slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const [legacyCanEdit, canChangePublishState] = await Promise.all([
      auth.canEditProducts(user.id, organization.id),
      auth.hasScopedPermission({
        userId: user.id,
        organizationId: organization.id,
        permissionKey: ScopedPermission.ProductPublishState,
        marketId,
        channelId,
      }),
    ]);

    if (!legacyCanEdit && !canChangePublishState) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    let channelProductIds: string[] | null = null;
    if (channelId || !legacyCanEdit) {
      const channelScope = await resolveProductChannelScope({
        authService: auth,
        supabase: supabaseServer as any,
        userId: user.id,
        organizationId: organization.id,
        permissionKey: ScopedPermission.ProductPublishState,
        channelId,
      });
      if (!channelScope.ok) {
        return channelScope.response;
      }
      channelProductIds = await getChannelScopedProductIds({
        supabase: supabaseServer as any,
        organizationId: organization.id,
        channelId: channelScope.channelId,
      });
      if (channelProductIds && channelProductIds.length === 0) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
    }

    await applyRLSContext(supabaseServer, {
      userId: user.id,
      organizationId: organization.id,
      organizationCode: organization.kindeOrgId,
    });

    if (channelProductIds) {
      const { data: targetProduct, error: targetProductError } = await (supabaseServer as any)
        .from("products")
        .select("id")
        .eq("id", productId)
        .eq("organization_id", organization.id)
        .single();

      if (targetProductError || !targetProduct || !channelProductIds.includes(targetProduct.id)) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
    }

    const { data: existingProduct, error: existingProductError } = await (supabaseServer as any)
      .from("products")
      .select("id,type,status")
      .eq("id", productId)
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (existingProductError || !existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const becomesBillable =
      !isBillableSkuRecord({ type: existingProduct.type, status: existingProduct.status }) &&
      isBillableSkuRecord({ type: existingProduct.type, status });

    if (becomesBillable) {
      const skuCapacity = await assertBillingCapacity({
        organizationId: organization.id,
        meter: "activeSkuCount",
      });
      if (!skuCapacity.allowed) {
        return NextResponse.json(
          {
            error: skuCapacity.message,
            code: "ACTIVE_SKU_LIMIT_REACHED",
            limit: skuCapacity.limit,
            usage: skuCapacity.usage,
          },
          { status: 403 }
        );
      }
    }

    if (status === "Active") {
      const { data: product, error: productError } = await (supabaseServer as any)
        .from("products")
        .select("id, family_id, product_name, sku, barcode")
        .eq("id", productId)
        .eq("organization_id", organization.id)
        .single();

      if (productError || !product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      const { data: familyRules } = await (supabaseServer as any)
        .from("product_families")
        .select("require_sku_on_active, require_barcode_on_active")
        .eq("id", product.family_id)
        .single();

      const requireSku = familyRules?.require_sku_on_active ?? true;
      const requireBarcode = familyRules?.require_barcode_on_active ?? false;

      if (!product.product_name || String(product.product_name).trim() === "") {
        return NextResponse.json(
          { error: "Active products must include a title." },
          { status: 400 }
        );
      }

      if (requireSku && (!product.sku || String(product.sku).trim() === "")) {
        return NextResponse.json(
          { error: "Active products must have a real SKU." },
          { status: 400 }
        );
      }

      if (requireBarcode && (!product.barcode || String(product.barcode).trim() === "")) {
        return NextResponse.json(
          { error: "Active products must have a barcode." },
          { status: 400 }
        );
      }

      const completeness = await evaluateProductCompleteness(
        organization.id,
        product.id,
        product.family_id
      );

      if (!completeness.isComplete) {
        return NextResponse.json(
          {
            error: "Product is missing required attributes",
            missingAttributes: completeness.missingAttributes,
          },
          { status: 400 }
        );
      }

      const requiredDocs = await evaluateRequiredDocumentRules({
        organizationId: organization.id,
        productId: product.id,
        familyId: product.family_id ?? null,
        channelId,
        marketId,
        destinationId,
        localeId,
      });

      if (requiredDocs.missingDocuments.length > 0) {
        return NextResponse.json(
          {
            error: "Product is missing required documents",
            missingDocuments: requiredDocs.missingDocuments,
          },
          { status: 400 }
        );
      }
    }

    const updated = await db.updateProductStatus(
      organization.id,
      productId,
      status,
      user.id
    );

    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updated_at,
      lastModifiedBy: updated.last_modified_by,
    });
  } catch (error) {
    console.error("Failed to update product status:", error);
    return NextResponse.json(
      { error: "Failed to update product status" },
      { status: 500 }
    );
  }
}
