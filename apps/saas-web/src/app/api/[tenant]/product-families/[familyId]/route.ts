import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UNIQUE_VIOLATION_ERROR = "23505";
const FK_VIOLATION_ERROR = "23503";
const ROW_NOT_FOUND_ERROR = "PGRST116";
const MISSING_COLUMN_ERROR = "42703";

const FAMILY_SELECT_WITH_RULES =
  "id,code,name,description,require_sku_on_active,require_barcode_on_active,created_at,updated_at";
const FAMILY_SELECT_BASE = "id,code,name,description,created_at,updated_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeCode(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

function isMissingColumnError(error: any): boolean {
  return error?.code === MISSING_COLUMN_ERROR;
}

async function fetchFamilyByIdOrCode(params: {
  organizationId: string;
  familyKey: string;
  selectClause: string;
}) {
  const { organizationId, familyKey, selectClause } = params;

  if (UUID_PATTERN.test(familyKey)) {
    const byId = await supabase
      .from("product_families")
      .select(selectClause)
      .eq("organization_id", organizationId)
      .eq("id", familyKey)
      .maybeSingle();

    if (byId.data || (byId.error && byId.error.code !== ROW_NOT_FOUND_ERROR)) {
      return byId;
    }
  }

  return await supabase
    .from("product_families")
    .select(selectClause)
    .eq("organization_id", organizationId)
    .eq("code", normalizeCode(familyKey))
    .maybeSingle();
}

// GET /api/[tenant]/product-families/[familyId] - Fetch product family by id or code
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;

    let familyResult = await fetchFamilyByIdOrCode({
      organizationId: targetOrganizationId,
      familyKey: familyId,
      selectClause: FAMILY_SELECT_WITH_RULES,
    });

    if (isMissingColumnError(familyResult.error)) {
      familyResult = await fetchFamilyByIdOrCode({
        organizationId: targetOrganizationId,
        familyKey: familyId,
        selectClause: FAMILY_SELECT_BASE,
      });
    }

    if (familyResult.error || !familyResult.data) {
      return NextResponse.json({ error: "Product family not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: familyResult.data });
  } catch (error) {
    console.error("Error in product family GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/[tenant]/product-families/[familyId] - Update product family
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenant, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const body = await request.json();
    const updatePayload: Record<string, unknown> = {};

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
      }
      updatePayload.name = name;
    }

    if (typeof body?.code === "string") {
      const code = normalizeCode(body.code);
      if (!code) {
        return NextResponse.json({ error: "Code cannot be empty." }, { status: 400 });
      }
      updatePayload.code = code;
    }

    if (typeof body?.description === "string") {
      updatePayload.description = body.description.trim() || null;
    } else if (body?.description === null) {
      updatePayload.description = null;
    }

    if (typeof body?.require_sku_on_active === "boolean") {
      updatePayload.require_sku_on_active = body.require_sku_on_active;
    }

    if (typeof body?.require_barcode_on_active === "boolean") {
      updatePayload.require_barcode_on_active = body.require_barcode_on_active;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    let updateResult = await supabase
      .from("product_families")
      .update(updatePayload)
      .eq("id", familyId)
      .eq("organization_id", targetOrganizationId)
      .select(FAMILY_SELECT_WITH_RULES)
      .single();

    if (isMissingColumnError(updateResult.error)) {
      const legacyPayload = { ...updatePayload };
      delete (legacyPayload as any).require_sku_on_active;
      delete (legacyPayload as any).require_barcode_on_active;

      updateResult = await supabase
        .from("product_families")
        .update(legacyPayload)
        .eq("id", familyId)
        .eq("organization_id", targetOrganizationId)
        .select(FAMILY_SELECT_BASE)
        .single();
    }

    const { data, error } = updateResult;

    if (error) {
      if (error.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "A product model with this code already exists." },
          { status: 409 }
        );
      }
      if (error.code === ROW_NOT_FOUND_ERROR) {
        return NextResponse.json({ error: "Product family not found." }, { status: 404 });
      }

      console.error("Error updating product family:", error);
      return NextResponse.json({ error: "Failed to update product family" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in product family PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/product-families/[familyId] - Delete product family
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenant, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;

    const { data, error } = await supabase
      .from("product_families")
      .delete()
      .eq("id", familyId)
      .eq("organization_id", targetOrganizationId)
      .select("id")
      .single();

    if (error) {
      if (error.code === FK_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "This model cannot be deleted because products still reference it." },
          { status: 409 }
        );
      }
      if (error.code === ROW_NOT_FOUND_ERROR) {
        return NextResponse.json({ error: "Product family not found." }, { status: 404 });
      }

      console.error("Error deleting product family:", error);
      return NextResponse.json({ error: "Failed to delete product family" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in product family DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
