import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { isLockedFieldGroupCode as isLockedFieldGroupCodeShared } from "@/lib/field-group-codes";

export 
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CORE_SYSTEM_FIELD_CODES = new Set([
  "title",
  "scin",
  "sku",
  "barcode",
  "coa_documents",
  "legal_documents",
  "sfp_documents",
]);

export const FIELD_GROUP_WITH_ASSIGNMENTS_SELECT = `
  *,
  product_field_group_assignments (
    *,
    product_fields!product_field_id (*)
  )
`;

type JsonRecord = Record<string, unknown>;
type NormalizedField = JsonRecord & {
  id?: string | null;
  name: string;
  allowed_channel_ids: string[];
  allowed_market_ids: string[];
  allowed_locale_ids: string[];
};
type NormalizedAssignment = JsonRecord & {
  product_fields: NormalizedField | null;
};
type NormalizedFieldGroup = JsonRecord & {
  product_field_group_assignments: NormalizedAssignment[];
  product_fields: NormalizedField[];
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function normalizeField(field: unknown): NormalizedField | null {
  if (!isRecord(field)) {
    return null;
  }

  const options =
    isRecord(field.options) ? field.options : {};
  const fieldName =
    typeof field.name === "string"
      ? field.name
      : typeof field.label === "string"
        ? field.label
        : typeof field.code === "string"
          ? field.code
          : "Untitled field";

  return {
    ...field,
    name: fieldName,
    allowed_channel_ids: asStringArray(
      field.allowed_channel_ids ?? options.allowed_channel_ids
    ),
    allowed_market_ids: asStringArray(
      field.allowed_market_ids ?? options.allowed_market_ids
    ),
    allowed_locale_ids: asStringArray(
      field.allowed_locale_ids ?? options.allowed_locale_ids
    ),
  };
}

export function normalizeAssignment(
  assignment: unknown
): NormalizedAssignment | null {
  if (!isRecord(assignment)) {
    return null;
  }

  return {
    ...assignment,
    product_fields: normalizeField(assignment.product_fields),
  };
}

export function normalizeFieldGroup(group: unknown): NormalizedFieldGroup | null {
  if (!isRecord(group)) {
    return null;
  }

  const assignments = Array.isArray(group.product_field_group_assignments)
    ? group.product_field_group_assignments
    : [];

  const normalizedAssignments = assignments
    .map((assignment) => normalizeAssignment(assignment))
    .filter((assignment): assignment is NormalizedAssignment => Boolean(assignment))
    .sort(
      (a, b) =>
        Number(a.sort_order ?? Number.MAX_SAFE_INTEGER) -
        Number(b.sort_order ?? Number.MAX_SAFE_INTEGER)
    );

  const dedupedFields = new Map<string, NormalizedField>();
  for (const assignment of normalizedAssignments) {
    const field = assignment.product_fields;
    if (!field?.id) continue;
    if (!dedupedFields.has(field.id)) {
      dedupedFields.set(field.id, field);
    }
  }

  return {
    ...group,
    product_field_group_assignments: normalizedAssignments,
    product_fields: Array.from(dedupedFields.values()),
  };
}

export function isCrossTenantWrite(
  tenantSlug: string,
  selectedBrandSlug: string | null
): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

export function isLockedFieldGroupCode(code: string | null | undefined): boolean {
  return isLockedFieldGroupCodeShared(code);
}

export async function resolveTargetOrganization(
  request: NextRequest,
  tenantSlug: string
): Promise<
  | {
      ok: true;
      targetOrganizationId: string;
      selectedBrandSlug: string | null;
    }
  | { ok: false; response: NextResponse }
> {
  const selectedBrandSlug = new URL(request.url).searchParams.get("brand");
  const contextResult = await resolveTenantBrandViewContext({
    request,
    tenantSlug,
    selectedBrandSlug,
  });

  if (!contextResult.ok) {
    return { ok: false, response: contextResult.response };
  }

  return {
    ok: true,
    targetOrganizationId: contextResult.context.targetOrganization.id,
    selectedBrandSlug,
  };
}

export async function resolveFieldGroupByKey(
  organizationId: string,
  groupKey: string
) {
  const key = groupKey.trim();

  const byCode = () =>
    getSupabaseServer()
      .from("field_groups")
      .select(FIELD_GROUP_WITH_ASSIGNMENTS_SELECT)
      .eq("organization_id", organizationId)
      .eq("code", key)
      .maybeSingle();

  if (UUID_PATTERN.test(key)) {
    const byId = await getSupabaseServer()
      .from("field_groups")
      .select(FIELD_GROUP_WITH_ASSIGNMENTS_SELECT)
      .eq("organization_id", organizationId)
      .eq("id", key)
      .maybeSingle();

    if (byId.data || byId.error) {
      return byId;
    }
  }

  return byCode();
}
