import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UNIQUE_VIOLATION_ERROR = "23505";

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

// GET /api/[tenant]/product-families - Fetch product families
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
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
    const { data, error } = await supabase
      .from("product_families")
      .select("id,code,name,description,created_at,updated_at")
      .eq("organization_id", targetOrganizationId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching product families:", error);
      return NextResponse.json({ error: "Failed to fetch product families" }, { status: 500 });
    }

    const families = data || [];
    if (families.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const familyIds = families.map((family) => family.id);

    const [{ data: groupAssignments, error: groupAssignmentsError }, { data: products, error: productsError }] =
      await Promise.all([
        supabase
          .from("product_family_field_groups")
          .select("product_family_id")
          .in("product_family_id", familyIds),
        supabase
          .from("products")
          .select("family_id")
          .eq("organization_id", targetOrganizationId)
          .in("family_id", familyIds),
      ]);

    if (groupAssignmentsError) {
      console.error("Error fetching product family group counts:", groupAssignmentsError);
      return NextResponse.json({ error: "Failed to fetch product families" }, { status: 500 });
    }

    if (productsError) {
      console.error("Error fetching product family product counts:", productsError);
      return NextResponse.json({ error: "Failed to fetch product families" }, { status: 500 });
    }

    const groupsCountByFamilyId = new Map<string, number>();
    for (const row of groupAssignments || []) {
      const familyId = row.product_family_id;
      if (!familyId) continue;
      groupsCountByFamilyId.set(familyId, (groupsCountByFamilyId.get(familyId) || 0) + 1);
    }

    const productsCountByFamilyId = new Map<string, number>();
    for (const row of products || []) {
      const familyId = row.family_id;
      if (!familyId) continue;
      productsCountByFamilyId.set(familyId, (productsCountByFamilyId.get(familyId) || 0) + 1);
    }

    const enrichedFamilies = families.map((family) => ({
      ...family,
      field_groups_count: groupsCountByFamilyId.get(family.id) || 0,
      products_count: productsCountByFamilyId.get(family.id) || 0,
    }));

    return NextResponse.json({
      success: true,
      data: enrichedFamilies,
    });
  } catch (error) {
    console.error("Error in product families GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/product-families - Create product family
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
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
    const createdBy = contextResult.context.userId;
    const body = await request.json();

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const codeInput = typeof body?.code === "string" ? body.code : name;
    const code = normalizeCode(codeInput);
    const description = typeof body?.description === "string" ? body.description.trim() : "";

    if (!name || !code) {
      return NextResponse.json({ error: "Name and code are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("product_families")
      .insert({
        organization_id: targetOrganizationId,
        code,
        name,
        description: description || null,
        created_by: createdBy,
      })
      .select("id,code,name,description,created_at,updated_at")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "A product model with this code already exists." },
          { status: 409 }
        );
      }

      console.error("Error creating product family:", error);
      return NextResponse.json({ error: "Failed to create product family" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Error in product families POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
