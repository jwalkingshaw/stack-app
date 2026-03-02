import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingTableError,
  normalizeUuidArray,
  requireSharingManagerContext,
} from "../../../_shared";

type ShareSetModule = "assets" | "products";

type ShareSetRecord = {
  id: string;
  module_key: ShareSetModule;
};

type ShareSetDynamicRule = {
  id: string;
  share_set_id: string;
  organization_id: string;
  name: string | null;
  is_active: boolean;
  priority: number;
  include_tags: string[];
  include_folder_ids: string[];
  include_usage_group_ids: string[];
  include_product_types: string[];
  include_product_family_ids: string[];
  include_product_name_contains: string[];
  exclude_tags: string[];
  exclude_folder_ids: string[];
  exclude_product_types: string[];
  exclude_product_family_ids: string[];
  exclude_product_name_contains: string[];
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const ALLOWED_PRODUCT_TYPES = new Set(["parent", "variant", "standalone"]);

function isMissingRuleFoundationError(error: any): boolean {
  if (!error) return false;
  if (isMissingTableError(error) || error?.code === "PGRST205" || error?.code === "42703") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("share_set_dynamic_rules") ||
    message.includes("share_set_items") ||
    message.includes("share_sets") ||
    message.includes("include_product_family_ids") ||
    message.includes("exclude_product_family_ids") ||
    message.includes("include_product_name_contains") ||
    message.includes("exclude_product_name_contains")
  );
}

function normalizeStringArray(value: unknown, options?: { lowercase?: boolean }): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    deduped.add(options?.lowercase ? trimmed.toLowerCase() : trimmed);
  }
  return Array.from(deduped);
}

function normalizeRuleInput(raw: unknown): {
  name: string | null;
  isActive: boolean;
  priority: number;
  includeTags: string[];
  includeFolderIds: string[];
  includeUsageGroupIds: string[];
  includeProductTypes: string[];
  includeProductFamilyIds: string[];
  includeProductNameContains: string[];
  excludeTags: string[];
  excludeFolderIds: string[];
  excludeProductTypes: string[];
  excludeProductFamilyIds: string[];
  excludeProductNameContains: string[];
  metadata: Record<string, unknown>;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  const name =
    typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : null;
  const isActive =
    typeof input.isActive === "boolean"
      ? input.isActive
      : typeof input.is_active === "boolean"
        ? input.is_active
        : true;
  const priorityRaw =
    typeof input.priority === "number"
      ? input.priority
      : typeof input.priority === "string"
        ? Number(input.priority)
        : 100;
  const priority = Number.isFinite(priorityRaw) ? Math.max(0, Math.floor(priorityRaw)) : 100;

  const metadata =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : {};

  return {
    name,
    isActive,
    priority,
    includeTags: normalizeStringArray(input.includeTags, { lowercase: true }),
    includeFolderIds: normalizeUuidArray(input.includeFolderIds),
    includeUsageGroupIds: normalizeStringArray(input.includeUsageGroupIds, { lowercase: true }),
    includeProductTypes: normalizeStringArray(input.includeProductTypes, { lowercase: true }),
    includeProductFamilyIds: normalizeUuidArray(input.includeProductFamilyIds),
    includeProductNameContains: normalizeStringArray(input.includeProductNameContains, {
      lowercase: true,
    }),
    excludeTags: normalizeStringArray(input.excludeTags, { lowercase: true }),
    excludeFolderIds: normalizeUuidArray(input.excludeFolderIds),
    excludeProductTypes: normalizeStringArray(input.excludeProductTypes, { lowercase: true }),
    excludeProductFamilyIds: normalizeUuidArray(input.excludeProductFamilyIds),
    excludeProductNameContains: normalizeStringArray(input.excludeProductNameContains, {
      lowercase: true,
    }),
    metadata,
  };
}

function validateRuleForModule(params: {
  moduleKey: ShareSetModule;
  input: ReturnType<typeof normalizeRuleInput>;
}): { ok: true } | { ok: false; status: number; error: string } {
  const { moduleKey, input } = params;
  if (!input) {
    return { ok: false, status: 400, error: "Invalid rule payload" };
  }

  if (moduleKey === "assets") {
    if (
      input.includeProductTypes.length > 0 ||
      input.excludeProductTypes.length > 0 ||
      input.includeProductFamilyIds.length > 0 ||
      input.excludeProductFamilyIds.length > 0 ||
      input.includeProductNameContains.length > 0 ||
      input.excludeProductNameContains.length > 0
    ) {
      return {
        ok: false,
        status: 400,
        error: "Asset rules do not support product conditions",
      };
    }
    const hasInclude =
      input.includeTags.length > 0 ||
      input.includeFolderIds.length > 0 ||
      input.includeUsageGroupIds.length > 0;
    if (!hasInclude) {
      return {
        ok: false,
        status: 400,
        error: "Asset rule must include at least one include condition",
      };
    }
    return { ok: true };
  }

  const invalidIncludeType = input.includeProductTypes.find((type) => !ALLOWED_PRODUCT_TYPES.has(type));
  if (invalidIncludeType) {
    return {
      ok: false,
      status: 400,
      error: `Invalid includeProductTypes value: ${invalidIncludeType}`,
    };
  }
  const invalidExcludeType = input.excludeProductTypes.find((type) => !ALLOWED_PRODUCT_TYPES.has(type));
  if (invalidExcludeType) {
    return {
      ok: false,
      status: 400,
      error: `Invalid excludeProductTypes value: ${invalidExcludeType}`,
    };
  }

  const hasProductInclude =
    input.includeProductTypes.length > 0 ||
    input.includeProductFamilyIds.length > 0 ||
    input.includeProductNameContains.length > 0;

  if (!hasProductInclude) {
    return {
      ok: false,
      status: 400,
      error: "Product rule must include at least one include condition (family/model or name contains)",
    };
  }

  return { ok: true };
}

async function getShareSet(params: {
  organizationId: string;
  setId: string;
}): Promise<{ ok: true; data: ShareSetRecord } | { ok: false; status: number; error: string }> {
  const { data, error } = await (supabaseServer as any)
    .from("share_sets")
    .select("id,module_key")
    .eq("organization_id", params.organizationId)
    .eq("id", params.setId)
    .maybeSingle();

  if (error) {
    if (isMissingRuleFoundationError(error)) {
      return {
        ok: false,
        status: 503,
        error: "Share set rules foundation is unavailable. Apply database migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to resolve share set" };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Share set not found" };
  }

  return { ok: true, data: data as ShareSetRecord };
}

// GET /api/[tenant]/sharing/sets/[setId]/rules
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireSharingManagerContext(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const setResult = await getShareSet({ organizationId: organization.id, setId: resolved.setId });
    if (!setResult.ok) {
      return NextResponse.json({ error: setResult.error }, { status: setResult.status });
    }

    const { data, error } = await (supabaseServer as any)
      .from("share_set_dynamic_rules")
      .select(
        "id,share_set_id,organization_id,name,is_active,priority,include_tags,include_folder_ids,include_usage_group_ids,include_product_types,include_product_family_ids,include_product_name_contains,exclude_tags,exclude_folder_ids,exclude_product_types,exclude_product_family_ids,exclude_product_name_contains,metadata,created_by,created_at,updated_at"
      )
      .eq("organization_id", organization.id)
      .eq("share_set_id", setResult.data.id)
      .order("priority", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingRuleFoundationError(error)) {
        return NextResponse.json(
          { error: "Share set rules foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to load set rules" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        set: setResult.data,
        rules: (data || []) as ShareSetDynamicRule[],
      },
    });
  } catch (error) {
    console.error("Error in set rules GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/sharing/sets/[setId]/rules
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireSharingManagerContext(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const setResult = await getShareSet({ organizationId: organization.id, setId: resolved.setId });
    if (!setResult.ok) {
      return NextResponse.json({ error: setResult.error }, { status: setResult.status });
    }

    const body = await request.json().catch(() => ({}));
    const input = normalizeRuleInput(body);
    const validation = validateRuleForModule({ moduleKey: setResult.data.module_key, input });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const payload = {
      organization_id: organization.id,
      share_set_id: setResult.data.id,
      name: input!.name,
      is_active: input!.isActive,
      priority: input!.priority,
      include_tags: input!.includeTags,
      include_folder_ids: input!.includeFolderIds,
      include_usage_group_ids: input!.includeUsageGroupIds,
      include_product_types: input!.includeProductTypes,
      include_product_family_ids: input!.includeProductFamilyIds,
      include_product_name_contains: input!.includeProductNameContains,
      exclude_tags: input!.excludeTags,
      exclude_folder_ids: input!.excludeFolderIds,
      exclude_product_types: input!.excludeProductTypes,
      exclude_product_family_ids: input!.excludeProductFamilyIds,
      exclude_product_name_contains: input!.excludeProductNameContains,
      metadata: input!.metadata,
      created_by: userId,
    };

    const { data, error } = await (supabaseServer as any)
      .from("share_set_dynamic_rules")
      .insert(payload)
      .select(
        "id,share_set_id,organization_id,name,is_active,priority,include_tags,include_folder_ids,include_usage_group_ids,include_product_types,include_product_family_ids,include_product_name_contains,exclude_tags,exclude_folder_ids,exclude_product_types,exclude_product_family_ids,exclude_product_name_contains,metadata,created_by,created_at,updated_at"
      )
      .single();

    if (error) {
      if (isMissingRuleFoundationError(error)) {
        return NextResponse.json(
          { error: "Share set rules foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to create set rule" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Error in set rules POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/[tenant]/sharing/sets/[setId]/rules?ruleId=...
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireSharingManagerContext(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const setResult = await getShareSet({ organizationId: organization.id, setId: resolved.setId });
    if (!setResult.ok) {
      return NextResponse.json({ error: setResult.error }, { status: setResult.status });
    }

    const ruleId = new URL(request.url).searchParams.get("ruleId")?.trim();
    if (!ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const input = normalizeRuleInput(body);
    const validation = validateRuleForModule({ moduleKey: setResult.data.module_key, input });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const { data, error } = await (supabaseServer as any)
      .from("share_set_dynamic_rules")
      .update({
        name: input!.name,
        is_active: input!.isActive,
        priority: input!.priority,
        include_tags: input!.includeTags,
        include_folder_ids: input!.includeFolderIds,
        include_usage_group_ids: input!.includeUsageGroupIds,
        include_product_types: input!.includeProductTypes,
        include_product_family_ids: input!.includeProductFamilyIds,
        include_product_name_contains: input!.includeProductNameContains,
        exclude_tags: input!.excludeTags,
        exclude_folder_ids: input!.excludeFolderIds,
        exclude_product_types: input!.excludeProductTypes,
        exclude_product_family_ids: input!.excludeProductFamilyIds,
        exclude_product_name_contains: input!.excludeProductNameContains,
        metadata: input!.metadata,
      })
      .eq("organization_id", organization.id)
      .eq("share_set_id", setResult.data.id)
      .eq("id", ruleId)
      .select(
        "id,share_set_id,organization_id,name,is_active,priority,include_tags,include_folder_ids,include_usage_group_ids,include_product_types,include_product_family_ids,include_product_name_contains,exclude_tags,exclude_folder_ids,exclude_product_types,exclude_product_family_ids,exclude_product_name_contains,metadata,created_by,created_at,updated_at"
      )
      .maybeSingle();

    if (error) {
      if (isMissingRuleFoundationError(error)) {
        return NextResponse.json(
          { error: "Share set rules foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to update set rule" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in set rules PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/sharing/sets/[setId]/rules?ruleId=...
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireSharingManagerContext(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const setResult = await getShareSet({ organizationId: organization.id, setId: resolved.setId });
    if (!setResult.ok) {
      return NextResponse.json({ error: setResult.error }, { status: setResult.status });
    }

    const ruleId = new URL(request.url).searchParams.get("ruleId")?.trim();
    if (!ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }

    const { error } = await (supabaseServer as any)
      .from("share_set_dynamic_rules")
      .delete()
      .eq("organization_id", organization.id)
      .eq("share_set_id", setResult.data.id)
      .eq("id", ruleId);

    if (error) {
      if (isMissingRuleFoundationError(error)) {
        return NextResponse.json(
          { error: "Share set rules foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to delete set rule" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in set rules DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
