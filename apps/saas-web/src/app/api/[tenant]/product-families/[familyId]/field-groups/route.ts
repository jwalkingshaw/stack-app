import { NextRequest, NextResponse } from "next/server";
import { resolvePartnerProductVisibilityPolicy } from "@/lib/partner-brand-view";
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
    source_output_profile_id,
    created_at,
    updated_at,
    output_channel_profiles!source_output_profile_id (
      id,
      name,
      profile_type
    ),
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

type PostgrestLikeError = { code?: string | null } | null | undefined;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isMissingColumnError(error: PostgrestLikeError): boolean {
  return error?.code === "42703";
}

function parseHiddenFields(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0);
}

function normalizeVisibilityCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeFamilyFieldGroups(data: unknown[] | null): Record<string, unknown>[] {
  return (data || []).map((entry) => {
    const group = asRecord(entry);
    const fieldGroup = asRecord(group.field_groups);
    const assignments = Array.isArray(fieldGroup.product_field_group_assignments)
      ? fieldGroup.product_field_group_assignments
      : [];

    const normalizedAssignments = assignments.map((assignmentEntry) => {
      const assignment = asRecord(assignmentEntry);
      const field = asRecord(assignment.product_fields);
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
      hidden_fields: parseHiddenFields(group.hidden_fields),
      field_groups: {
        ...fieldGroup,
        product_field_group_assignments: normalizedAssignments,
      },
    };
  });
}

async function fetchFamilyFieldGroups(
  familyId: string
): Promise<{ data: unknown[] | null; error: PostgrestLikeError }> {
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

  return {
    data: Array.isArray(result.data) ? (result.data as unknown[]) : null,
    error: result.error as PostgrestLikeError,
  };
}

function applyPartnerVisibilityPolicyToFamilyFieldGroups(params: {
  groups: Record<string, unknown>[];
  allowAllGroups: boolean;
  allowedGroupCodes: string[];
  allowedFieldCodes: string[];
}): Record<string, unknown>[] {
  if (params.allowAllGroups) return params.groups;

  const allowedGroupCodes = new Set(
    params.allowedGroupCodes.map((code) => normalizeVisibilityCode(code)).filter(Boolean)
  );
  const allowedFieldCodes = new Set(
    params.allowedFieldCodes.map((code) => normalizeVisibilityCode(code)).filter(Boolean)
  );

  const filteredGroups: Record<string, unknown>[] = [];

  for (const group of params.groups) {
    const fieldGroup = asRecord(group.field_groups);
    const groupCode = normalizeVisibilityCode(fieldGroup.code);
    const groupAllowed = groupCode.length > 0 && allowedGroupCodes.has(groupCode);

    const assignmentsRaw = Array.isArray(fieldGroup.product_field_group_assignments)
      ? fieldGroup.product_field_group_assignments
      : [];

    const assignments = assignmentsRaw
      .map((entry) => asRecord(entry))
      .filter((assignment) => {
        if (groupAllowed) return true;
        const field = asRecord(assignment.product_fields);
        const fieldCode = normalizeVisibilityCode(field.code);
        return fieldCode.length > 0 && allowedFieldCodes.has(fieldCode);
      });

    if (!groupAllowed && assignments.length === 0) {
      continue;
    }

    const visibleFieldIds = new Set(
      assignments
        .map((assignment) => normalizeVisibilityCode(assignment.product_field_id))
        .filter(Boolean)
    );
    const hiddenFields = parseHiddenFields(group.hidden_fields).filter((fieldId) =>
      visibleFieldIds.has(normalizeVisibilityCode(fieldId))
    );

    filteredGroups.push({
      ...group,
      hidden_fields: hiddenFields,
      field_groups: {
        ...fieldGroup,
        product_field_group_assignments: assignments,
      },
    });
  }

  return filteredGroups;
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

    const shouldUseSharedCache = familyContext.mode !== "partner_brand";
    if (shouldUseSharedCache) {
      const cached = await getFamilyFieldGroupsCache({
        organizationId: familyContext.organizationId,
        familyId: familyContext.familyId,
      });
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const { data, error } = await fetchFamilyFieldGroups(familyContext.familyId);
    if (error) {
      console.error("Error fetching family field groups:", error);
      return NextResponse.json({ error: "Failed to fetch family field groups" }, { status: 500 });
    }

    let normalized = normalizeFamilyFieldGroups(data);

    if (familyContext.mode === "partner_brand" && familyContext.partnerOrganizationId) {
      const policy = await resolvePartnerProductVisibilityPolicy({
        brandOrganizationId: familyContext.organizationId,
        partnerOrganizationId: familyContext.partnerOrganizationId,
      });

      if (!policy.foundationAvailable) {
        return NextResponse.json(
          { error: "Share Set visibility foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }

      normalized = applyPartnerVisibilityPolicyToFamilyFieldGroups({
        groups: normalized,
        allowAllGroups: policy.allowAllGroups,
        allowedGroupCodes: policy.allowedGroupCodes,
        allowedFieldCodes: policy.allowedFieldCodes,
      });
    }

    if (shouldUseSharedCache) {
      await setFamilyFieldGroupsCache({
        organizationId: familyContext.organizationId,
        familyId: familyContext.familyId,
        data: normalized,
      });
    }

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

    const body = asRecord(await request.json().catch(() => ({})));
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

    const insertPayload: Record<string, unknown> = {
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

    await invalidateFamilyFieldGroupsCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });

    const { data, error } = await fetchFamilyFieldGroups(familyContext.familyId);
    if (error) {
      console.error("Error fetching updated family field groups:", error);
      return NextResponse.json({ error: "Failed to fetch updated field group assignments." }, { status: 500 });
    }

    const normalized = normalizeFamilyFieldGroups(data);
    const created = normalized.find((item) => item.field_group_id === fieldGroupId);

    if (!created) {
      return NextResponse.json({ error: "Failed to resolve assignment after write." }, { status: 500 });
    }

    await setFamilyFieldGroupsCache({
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

