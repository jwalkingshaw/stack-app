import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess, setDatabaseUserContext } from "@/lib/user-context";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
const UPC_MISSING_COLUMN_ERROR = "42703";
const ALLOWED_STATUS = new Set([
  "Draft",
  "Enrichment",
  "Review",
  "Active",
  "Discontinued",
  "Archived",
]);

const VARIANT_SELECT_WITH_BARCODE = `
  id,
  scin,
  type,
  parent_id,
  family_id,
  product_name,
  sku,
  barcode,
  status,
  variant_attributes,
  variant_axis
`;

const VARIANT_SELECT_WITH_UPC =
  VARIANT_SELECT_WITH_BARCODE.replace("barcode", "upc");

function withNormalizedBarcode<T extends Record<string, any>>(
  row: T
): T & { barcode: string | null } {
  return {
    ...row,
    barcode: row.barcode ?? row.upc ?? null,
  };
}

function isCrossTenantWrite(params: { tenant: string; selectedBrandSlug: string | null }): boolean {
  const selected = (params.selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== params.tenant.trim().toLowerCase();
}

function normalizeBarcodeInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateBarcode(barcode: string | null): string | null {
  if (!barcode) return null;
  if (![8, 12, 13, 14].includes(barcode.length) || !/^\d+$/.test(barcode)) {
    return "Barcode must be 8, 12, 13, or 14 digits.";
  }
  return null;
}

function normalizeVariantAttributes(input: unknown): Record<string, any> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, any>).map(([key, value]) => [key, value])
  );
}

async function resolveProductByIdentifier(params: {
  organizationId: string;
  productIdOrSku: string;
}) {
  const normalizedIdentifier = (params.productIdOrSku || "").trim();
  const uuidPrefixMatch = normalizedIdentifier.match(UUID_PREFIX_PATTERN);
  const candidateId = uuidPrefixMatch?.[1] || normalizedIdentifier;

  if (UUID_PATTERN.test(candidateId)) {
    const byId = await supabase
      .from("products")
      .select("id,type,parent_id,family_id")
      .eq("id", candidateId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (byId.data || byId.error) return byId;
  }

  return await supabase
    .from("products")
    .select("id,type,parent_id,family_id")
    .ilike("sku", normalizedIdentifier)
    .eq("organization_id", params.organizationId)
    .limit(1)
    .maybeSingle();
}

async function getVariantByIdentifier(params: {
  organizationId: string;
  parentId: string;
  variantKey: string;
  selectClause: string;
}) {
  const normalizedIdentifier = (params.variantKey || "").trim();
  const uuidPrefixMatch = normalizedIdentifier.match(UUID_PREFIX_PATTERN);
  const candidateId = uuidPrefixMatch?.[1] || normalizedIdentifier;

  if (UUID_PATTERN.test(candidateId)) {
    const byId = await supabase
      .from("products")
      .select(params.selectClause)
      .eq("id", candidateId)
      .eq("organization_id", params.organizationId)
      .eq("parent_id", params.parentId)
      .eq("type", "variant")
      .maybeSingle();

    if (byId.data || byId.error) {
      return byId;
    }
  }

  const byScin = await supabase
    .from("products")
    .select(params.selectClause)
    .eq("scin", normalizedIdentifier.toUpperCase())
    .eq("organization_id", params.organizationId)
    .eq("parent_id", params.parentId)
    .eq("type", "variant")
    .limit(1)
    .maybeSingle();
  if (byScin.data || byScin.error) {
    return byScin;
  }

  return await supabase
    .from("products")
    .select(params.selectClause)
    .ilike("sku", normalizedIdentifier)
    .eq("organization_id", params.organizationId)
    .eq("parent_id", params.parentId)
    .eq("type", "variant")
    .limit(1)
    .maybeSingle();
}

async function getFamilyActivationRules(params: {
  familyId: string | null;
}): Promise<{ requireSkuOnActive: boolean; requireBarcodeOnActive: boolean }> {
  if (!params.familyId) {
    return {
      requireSkuOnActive: true,
      requireBarcodeOnActive: false,
    };
  }

  const { data, error } = await supabase
    .from("product_families")
    .select("require_sku_on_active, require_barcode_on_active")
    .eq("id", params.familyId)
    .maybeSingle();

  if (error) {
    if (error.code === UPC_MISSING_COLUMN_ERROR) {
      return {
        requireSkuOnActive: true,
        requireBarcodeOnActive: false,
      };
    }
    return {
      requireSkuOnActive: true,
      requireBarcodeOnActive: false,
    };
  }

  return {
    requireSkuOnActive: data?.require_sku_on_active ?? true,
    requireBarcodeOnActive: data?.require_barcode_on_active ?? false,
  };
}

async function resolveParentProduct(params: {
  organizationId: string;
  productId: string;
}): Promise<{ id: string; type: string; parent_id: string | null; family_id: string | null } | null> {
  const parentLookup = await resolveProductByIdentifier({
    organizationId: params.organizationId,
    productIdOrSku: params.productId,
  });
  let parent = parentLookup.data as
    | { id: string; type: string; parent_id: string | null; family_id: string | null }
    | null;

  if (parentLookup.error || !parent) return null;

  if (parent.type === "variant" && parent.parent_id) {
    const { data: parentRow, error: parentError } = await supabase
      .from("products")
      .select("id,type,parent_id,family_id")
      .eq("id", parent.parent_id)
      .eq("organization_id", params.organizationId)
      .maybeSingle();

    if (parentError || !parentRow) return null;
    parent = parentRow as typeof parent;
  }

  return parent;
}

// PUT /api/[tenant]/products/[productId]/variants/[variantId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string; variantId: string }> }
) {
  try {
    const { tenant, productId, variantId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite({ tenant, selectedBrandSlug })) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, "collaborate");
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to update products in this organization." },
        { status: 403 }
      );
    }
    const organizationId = access.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "Organization context is missing." }, { status: 500 });
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const parent = await resolveParentProduct({
      organizationId,
      productId,
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent product not found" }, { status: 404 });
    }

    let variantResult = await getVariantByIdentifier({
      organizationId,
      parentId: parent.id,
      variantKey: variantId,
      selectClause: VARIANT_SELECT_WITH_BARCODE,
    });
    if (variantResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
      variantResult = await getVariantByIdentifier({
        organizationId,
        parentId: parent.id,
        variantKey: variantId,
        selectClause: VARIANT_SELECT_WITH_UPC,
      });
    }

    const existingVariant = variantResult.data
      ? withNormalizedBarcode(variantResult.data as Record<string, any>)
      : null;
    if (variantResult.error || !existingVariant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const updatePayload: Record<string, any> = {
      last_modified_by: user.id,
    };

    if (typeof body?.product_name === "string") {
      const productName = body.product_name.trim();
      if (!productName) {
        return NextResponse.json({ error: "product_name cannot be empty." }, { status: 400 });
      }
      updatePayload.product_name = productName;
    }

    if (typeof body?.sku === "string") {
      updatePayload.sku = body.sku.trim() || null;
    } else if (body?.sku === null) {
      updatePayload.sku = null;
    }

    if (typeof body?.status !== "undefined") {
      if (typeof body.status !== "string" || !ALLOWED_STATUS.has(body.status)) {
        return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
      }
      updatePayload.status = body.status;
    }

    if (Object.prototype.hasOwnProperty.call(body || {}, "barcode") || Object.prototype.hasOwnProperty.call(body || {}, "upc")) {
      const barcode = normalizeBarcodeInput(body?.barcode) ?? normalizeBarcodeInput(body?.upc);
      const barcodeError = validateBarcode(barcode);
      if (barcodeError) {
        return NextResponse.json({ error: barcodeError }, { status: 400 });
      }
      updatePayload.barcode = barcode;
    }

    if (
      Object.prototype.hasOwnProperty.call(body || {}, "variant_attributes") ||
      Object.prototype.hasOwnProperty.call(body || {}, "variant_attribute_values") ||
      Object.prototype.hasOwnProperty.call(body || {}, "variant_axis")
    ) {
      const variantAttributes = normalizeVariantAttributes(
        body?.variant_attribute_values ?? body?.variant_attributes ?? body?.variant_axis
      );
      updatePayload.variant_attributes = variantAttributes;
      updatePayload.variant_axis = variantAttributes;
    }

    if (typeof body?.msrp === "number" || body?.msrp === null) {
      updatePayload.msrp = body.msrp;
    }
    if (typeof body?.cost_of_goods === "number" || body?.cost_of_goods === null) {
      updatePayload.cost_of_goods = body.cost_of_goods;
    }
    if (typeof body?.margin_percent === "number" || body?.margin_percent === null) {
      updatePayload.margin_percent = body.margin_percent;
    }

    const nextStatus = updatePayload.status ?? existingVariant.status;
    const nextSku = updatePayload.sku ?? existingVariant.sku;
    const nextBarcode = Object.prototype.hasOwnProperty.call(updatePayload, "barcode")
      ? updatePayload.barcode
      : existingVariant.barcode;

    if (nextStatus === "Active") {
      const rules = await getFamilyActivationRules({
        familyId: existingVariant.family_id ?? parent.family_id ?? null,
      });

      if (rules.requireSkuOnActive && (!nextSku || String(nextSku).trim().length === 0)) {
        return NextResponse.json(
          { error: "Active variants must include a SKU." },
          { status: 400 }
        );
      }

      if (rules.requireBarcodeOnActive && (!nextBarcode || String(nextBarcode).trim().length === 0)) {
        return NextResponse.json(
          { error: "Active variants must include a barcode." },
          { status: 400 }
        );
      }
    }

    let updateResult = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", existingVariant.id)
      .eq("organization_id", organizationId)
      .eq("parent_id", parent.id)
      .eq("type", "variant")
      .select(VARIANT_SELECT_WITH_BARCODE)
      .single();

    if (updateResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
      const legacyPayload: Record<string, any> = {
        ...updatePayload,
      };

      if (Object.prototype.hasOwnProperty.call(legacyPayload, "barcode")) {
        legacyPayload.upc = legacyPayload.barcode;
        delete legacyPayload.barcode;
      }

      updateResult = await supabase
        .from("products")
        .update(legacyPayload)
        .eq("id", existingVariant.id)
        .eq("organization_id", organizationId)
        .eq("parent_id", parent.id)
        .eq("type", "variant")
        .select(VARIANT_SELECT_WITH_UPC)
        .single();
    }

    if (updateResult.error || !updateResult.data) {
      if (updateResult.error?.code === "23505") {
        return NextResponse.json(
          { error: "Variant conflicts with an existing unique identifier (SCIN/SKU/barcode)." },
          { status: 409 }
        );
      }
      console.error("Error updating variant:", updateResult.error);
      return NextResponse.json({ error: "Failed to update variant." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: withNormalizedBarcode(updateResult.data as Record<string, any>),
    });
  } catch (error) {
    console.error("Error in variant PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/[tenant]/products/[productId]/variants/[variantId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string; variantId: string }> }
) {
  return PUT(request, { params });
}

// DELETE /api/[tenant]/products/[productId]/variants/[variantId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string; variantId: string }> }
) {
  try {
    const { tenant, productId, variantId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite({ tenant, selectedBrandSlug })) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, "collaborate");
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to update products in this organization." },
        { status: 403 }
      );
    }
    const organizationId = access.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "Organization context is missing." }, { status: 500 });
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const parent = await resolveParentProduct({
      organizationId,
      productId,
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent product not found" }, { status: 404 });
    }

    const variantLookup = await getVariantByIdentifier({
      organizationId,
      parentId: parent.id,
      variantKey: variantId,
      selectClause: "id, parent_id, type",
    });

    const variant = variantLookup.data as { id: string; parent_id: string | null; type: string } | null;
    if (variantLookup.error || !variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", variant.id)
      .eq("organization_id", organizationId)
      .eq("parent_id", parent.id)
      .eq("type", "variant");

    if (deleteError) {
      console.error("Error deleting variant:", deleteError);
      return NextResponse.json({ error: "Failed to delete variant." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in variant DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
