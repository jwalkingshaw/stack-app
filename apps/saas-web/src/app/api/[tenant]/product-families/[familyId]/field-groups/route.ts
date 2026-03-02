import { NextRequest, NextResponse } from "next/server";
import {
  getFamilyFieldGroupsCache,
  invalidateFamilyFieldGroupsCache,
  isCrossTenantWrite,
  resolveFamilyContext,
  setFamilyFieldGroupsCache,
  supabase,
} from "./_shared";

const PRODUCT_FIELDS_SELECT_WITH_SCOPES = `
  id,
  organization_id,
  code,
  name,
  description,
  field_type,
  is_required,
  is_unique,
  is_localizable,
  is_channelable,
  allowed_channel_ids,
  allowed_market_ids,
  allowed_locale_ids,
  sort_order,
  default_value,
  validation_rules,
  options,
  is_active,
  created_at,
  updated_at
`;

const PRODUCT_FIELDS_SELECT_LEGACY = `
  id,
  organization_id,
  code,
  name,
  description,
  field_type,
  is_required,
  is_unique,
  is_localizable,
  is_channelable,
  sort_order,
  default_value,
  validation_rules,
  options,
  is_active,
  created_at,
  updated_at
`;

const FIELD_GROUP_SELECT_WITH_SCOPES = `
  id,
  product_family_id,
  field_group_id,
  hidden_fields,
  sort_order,
  field_groups!field_group_id (
    id,
    organization_id,
    code,
    name,
    description,
    sort_order,
    is_active,
    created_at,
    updated_at,
    product_field_group_assignments (
      id,
      product_field_id,
      field_group_id,
      sort_order,
      created_at,
      updated_at,
      product_fields!product_field_id (
        ${PRODUCT_FIELDS_SELECT_WITH_SCOPES}
      )
    )
  )
`;

const FIELD_GROUP_SELECT_LEGACY = `
  id,
  product_family_id,
  field_group_id,
  hidden_fields,
  sort_order,
  field_groups!field_group_id (
    id,
    organization_id,
    code,
    name,
    description,
    sort_order,
    is_active,
    created_at,
    updated_at,
    product_field_group_assignments (
      id,
      product_field_id,
      field_group_id,
      sort_order,
      created_at,
      updated_at,
      product_fields!product_field_id (
        ${PRODUCT_FIELDS_SELECT_LEGACY}
      )
    )
  )
`;

function isMissingColumnError(error: any): boolean {
  return error?.code === "42703";
}

function parseHiddenFields(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0);
}

function normalizeFamilyFieldGroups(data: any[] | null): any[] {
  return (data || []).map((group: any) => {
    const assignments = Array.isArray(group?.field_groups?.product_field_group_assignments)
      ? group.field_groups.product_field_group_assignments
      : [];

    const normalizedAssignments = assignments.map((assignment: any) => {
      const field = assignment?.product_fields || {};
      return {
        ...assignment,
        product_fields: {
          ...field,
          name: field.name || field.label || field.code || "Untitled field",
          allowed_channel_ids: Array.isArray(field.allowed_channel_ids)
            ? field.allowed_channel_ids
            : [],
          allowed_market_ids: Array.isArray(field.allowed_market_ids)
            ? field.allowed_market_ids
            : [],
          allowed_locale_ids: Array.isArray(field.allowed_locale_ids)
            ? field.allowed_locale_ids
            : [],
        },
      };
    });

    return {
      ...group,
      hidden_fields: parseHiddenFields(group?.hidden_fields),
      field_groups: {
        ...group.field_groups,
        product_field_group_assignments: normalizedAssignments,
      },
    };
  });
}

async function fetchFamilyFieldGroups(
  familyId: string
): Promise<{ data: any[] | null; error: any }> {
  const runQuery = (selectClause: string) =>
    supabase
      .from("product_family_field_groups")
      .select(selectClause)
      .eq("product_family_id", familyId)
      .order("sort_order", { ascending: true });

  let result = await runQuery(FIELD_GROUP_SELECT_WITH_SCOPES);
  if (isMissingColumnError(result.error)) {
    result = await runQuery(FIELD_GROUP_SELECT_LEGACY);
  }

  return result;
}

// GET /api/[tenant]/product-families/[familyId]/field-groups
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
    const familyContext = await resolveFamilyContext({
      request,
      tenant,
      familyKey: familyId,
    });
    if (!familyContext.ok) {
      return familyContext.response;
    }

    const cached = getFamilyFieldGroupsCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });
    if (cached) {
      return NextResponse.json(cached);
    }

    const { data, error } = await fetchFamilyFieldGroups(familyContext.familyId);
    if (error) {
      console.error("Error fetching family field groups:", error);
      return NextResponse.json({ error: "Failed to fetch family field groups" }, { status: 500 });
    }

    const normalized = normalizeFamilyFieldGroups(data);
    setFamilyFieldGroupsCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
      data: normalized,
    });

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Error in family field groups GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/product-families/[familyId]/field-groups
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
    const familyContext = await resolveFamilyContext({
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
    const fieldGroupId =
      typeof body?.field_group_id === "string" ? body.field_group_id.trim() : "";
    if (!fieldGroupId) {
      return NextResponse.json({ error: "field_group_id is required." }, { status: 400 });
    }

    const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : 0;
    const hiddenFields = parseHiddenFields(body?.hidden_fields);

    const { data: fieldGroup, error: fieldGroupError } = await supabase
      .from("field_groups")
      .select("id")
      .eq("id", fieldGroupId)
      .eq("organization_id", familyContext.organizationId)
      .maybeSingle();
    if (fieldGroupError) {
      console.error("Error validating field group for family assignment:", fieldGroupError);
      return NextResponse.json({ error: "Failed to validate field group." }, { status: 500 });
    }
    if (!fieldGroup) {
      return NextResponse.json({ error: "Field group not found." }, { status: 404 });
    }

    const insertPayload: Record<string, any> = {
      product_family_id: familyContext.familyId,
      field_group_id: fieldGroupId,
      sort_order: sortOrder,
      hidden_fields: hiddenFields,
    };

    const { error: upsertError } = await supabase
      .from("product_family_field_groups")
      .upsert(insertPayload, {
        onConflict: "product_family_id,field_group_id",
        ignoreDuplicates: false,
      });
    if (upsertError) {
      console.error("Error upserting family field group assignment:", upsertError);
      return NextResponse.json({ error: "Failed to assign field group to family." }, { status: 500 });
    }

    invalidateFamilyFieldGroupsCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });

    const { data, error } = await fetchFamilyFieldGroups(familyContext.familyId);
    if (error) {
      console.error("Error fetching updated family field groups:", error);
      return NextResponse.json({ error: "Failed to fetch updated field group assignments." }, { status: 500 });
    }

    const normalized = normalizeFamilyFieldGroups(data);
    const created = normalized.find((item: any) => item.field_group_id === fieldGroupId);

    if (!created) {
      return NextResponse.json({ error: "Failed to resolve assignment after write." }, { status: 500 });
    }

    setFamilyFieldGroupsCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
      data: normalized,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error in family field groups POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

