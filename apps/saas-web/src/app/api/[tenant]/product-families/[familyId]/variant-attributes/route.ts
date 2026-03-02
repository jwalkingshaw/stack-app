import { NextRequest, NextResponse } from "next/server";
import {
  getVariantAttributesCache,
  invalidateVariantAttributesCache,
  isCrossTenantWrite,
  resolveVariantAttributeFamilyContext,
  setVariantAttributesCache,
  supabase,
} from "./_shared";

const PRODUCT_FIELDS_SELECT = `
  id,
  code,
  name,
  description,
  field_type,
  validation_rules,
  options
`;

const PRODUCT_FIELDS_SELECT_LEGACY = `
  id,
  code,
  name,
  description,
  field_type,
  options
`;

function isMissingTableError(error: any): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function isMissingColumnError(error: any): boolean {
  return error?.code === "42703";
}

function normalizeVariantAttributes(data: any[] | null): any[] {
  return (data || []).map((item: any) => {
    const field = item.product_fields || {};
    return {
      id: item.id,
      product_field_id: item.product_field_id,
      field_code: field.code || "",
      field_name: field.name || field.label || field.code || "Untitled field",
      field_type: field.field_type || "text",
      field_description: field.description || null,
      sort_order: item.sort_order || 0,
      is_required: Boolean(item.is_required),
      validation_rules: field.validation_rules || {},
      options: field.options || {},
    };
  });
}

async function fetchVariantAttributes(familyId: string) {
  const runQuery = (productFieldSelect: string) =>
    supabase
      .from("product_family_variant_attributes")
      .select(
        `
        id,
        product_family_id,
        product_field_id,
        sort_order,
        is_required,
        product_fields!product_field_id (
          ${productFieldSelect}
        )
      `
      )
      .eq("product_family_id", familyId)
      .order("sort_order", { ascending: true });

  let result = await runQuery(PRODUCT_FIELDS_SELECT);
  if (isMissingColumnError(result.error)) {
    result = await runQuery(PRODUCT_FIELDS_SELECT_LEGACY);
  }

  return result;
}

async function isFieldAssignedToFamily(params: {
  familyId: string;
  productFieldId: string;
}): Promise<boolean> {
  const { data: familyGroups, error: groupsError } = await supabase
    .from("product_family_field_groups")
    .select("field_group_id")
    .eq("product_family_id", params.familyId);

  if (groupsError) {
    console.error("Error loading family field groups for variant-attribute validation:", groupsError);
    return false;
  }

  const groupIds = (familyGroups || [])
    .map((group) => group.field_group_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (groupIds.length === 0) {
    return false;
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("product_field_group_assignments")
    .select("id")
    .eq("product_field_id", params.productFieldId)
    .in("field_group_id", groupIds)
    .limit(1)
    .maybeSingle();

  if (assignmentError) {
    console.error("Error validating family field assignment for variant-attribute:", assignmentError);
    return false;
  }

  return Boolean(assignment?.id);
}

// GET /api/[tenant]/product-families/[familyId]/variant-attributes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
    const familyContext = await resolveVariantAttributeFamilyContext({
      request,
      tenant,
      familyKey: familyId,
    });
    if (!familyContext.ok) {
      return familyContext.response;
    }

    const cached = getVariantAttributesCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    const { data, error } = await fetchVariantAttributes(familyContext.familyId);
    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ success: true, data: [] });
      }
      console.error("Error fetching variant attributes:", error);
      return NextResponse.json({ error: "Failed to fetch variant attributes" }, { status: 500 });
    }

    const normalized = normalizeVariantAttributes(data);
    setVariantAttributesCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
      data: normalized,
    });

    return NextResponse.json({ success: true, data: normalized });
  } catch (error) {
    console.error("Error in variant attributes GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/product-families/[familyId]/variant-attributes
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
    const familyContext = await resolveVariantAttributeFamilyContext({
      request,
      tenant,
      familyKey: familyId,
    });
    if (!familyContext.ok) {
      return familyContext.response;
    }

    if (isCrossTenantWrite(tenant, familyContext.selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const productFieldId =
      typeof body?.product_field_id === "string" ? body.product_field_id.trim() : "";
    if (!productFieldId) {
      return NextResponse.json({ error: "product_field_id is required." }, { status: 400 });
    }

    const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : 0;
    const isRequired = Boolean(body?.is_required);

    const { data: field, error: fieldError } = await supabase
      .from("product_fields")
      .select("id")
      .eq("id", productFieldId)
      .eq("organization_id", familyContext.organizationId)
      .maybeSingle();
    if (fieldError) {
      console.error("Error validating product field:", fieldError);
      return NextResponse.json({ error: "Failed to validate attribute." }, { status: 500 });
    }
    if (!field) {
      return NextResponse.json({ error: "Attribute not found for this organization." }, { status: 404 });
    }

    const assignedToFamily = await isFieldAssignedToFamily({
      familyId: familyContext.familyId,
      productFieldId,
    });
    if (!assignedToFamily) {
      return NextResponse.json(
        { error: "Attribute must be assigned to this family before it can be used as a variant axis." },
        { status: 400 }
      );
    }

    const { error: upsertError } = await supabase
      .from("product_family_variant_attributes")
      .upsert(
        {
          product_family_id: familyContext.familyId,
          product_field_id: productFieldId,
          sort_order: sortOrder,
          is_required: isRequired,
        },
        {
          onConflict: "product_family_id,product_field_id",
          ignoreDuplicates: false,
        }
      );

    if (upsertError) {
      if (isMissingTableError(upsertError)) {
        return NextResponse.json(
          { error: "Variant attribute table is unavailable. Run the latest migrations first." },
          { status: 409 }
        );
      }
      console.error("Error upserting variant attribute:", upsertError);
      return NextResponse.json({ error: "Failed to add variant axis." }, { status: 500 });
    }

    invalidateVariantAttributesCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });

    const { data, error } = await fetchVariantAttributes(familyContext.familyId);
    if (error) {
      console.error("Error fetching variant attributes after upsert:", error);
      return NextResponse.json({ error: "Failed to fetch variant attributes." }, { status: 500 });
    }

    const normalized = normalizeVariantAttributes(data);
    setVariantAttributesCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
      data: normalized,
    });

    const created = normalized.find((item: any) => item.product_field_id === productFieldId);
    return NextResponse.json({ success: true, data: created || null }, { status: 201 });
  } catch (error) {
    console.error("Error in variant attributes POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/[tenant]/product-families/[familyId]/variant-attributes
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
    const familyContext = await resolveVariantAttributeFamilyContext({
      request,
      tenant,
      familyKey: familyId,
    });
    if (!familyContext.ok) {
      return familyContext.response;
    }

    if (isCrossTenantWrite(tenant, familyContext.selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const attributes = Array.isArray(body?.attributes) ? body.attributes : [];
    if (attributes.length === 0) {
      return NextResponse.json({ error: "attributes must be a non-empty array." }, { status: 400 });
    }

    const updates: Array<{ id: string; sort_order: number; is_required?: boolean }> = attributes
      .map((attribute: any, index: number) => ({
        id: typeof attribute?.id === "string" ? attribute.id.trim() : "",
        sort_order: Number.isFinite(Number(attribute?.sort_order))
          ? Number(attribute.sort_order)
          : index,
        is_required:
          typeof attribute?.is_required === "boolean" ? attribute.is_required : undefined,
      }))
      .filter((attribute: { id: string }) => attribute.id.length > 0);

    if (updates.length === 0) {
      return NextResponse.json({ error: "No valid attributes were provided." }, { status: 400 });
    }

    const updateResults = await Promise.all(
      updates.map(async (attribute: { id: string; sort_order: number; is_required?: boolean }) => {
        const payload: Record<string, any> = {
          sort_order: attribute.sort_order,
        };
        if (typeof attribute.is_required === "boolean") {
          payload.is_required = attribute.is_required;
        }

        return supabase
          .from("product_family_variant_attributes")
          .update(payload)
          .eq("id", attribute.id)
          .eq("product_family_id", familyContext.familyId);
      })
    );

    const failed = updateResults.filter((result) => result.error);
    if (failed.length > 0) {
      if (failed.some((result) => isMissingTableError(result.error))) {
        return NextResponse.json(
          { error: "Variant attribute table is unavailable. Run the latest migrations first." },
          { status: 409 }
        );
      }
      console.error("Error updating one or more variant attribute records:", failed);
      return NextResponse.json({ error: "Failed to update variant axes." }, { status: 500 });
    }

    invalidateVariantAttributesCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });

    const { data, error } = await fetchVariantAttributes(familyContext.familyId);
    if (error) {
      console.error("Error fetching variant attributes after reorder:", error);
      return NextResponse.json({ error: "Failed to fetch variant attributes." }, { status: 500 });
    }

    const normalized = normalizeVariantAttributes(data);
    setVariantAttributesCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
      data: normalized,
    });

    return NextResponse.json({ success: true, data: normalized });
  } catch (error) {
    console.error("Error in variant attributes PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
