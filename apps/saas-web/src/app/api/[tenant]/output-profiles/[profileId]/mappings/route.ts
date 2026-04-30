import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";


function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableText(value: unknown): string | null {
  return normalizeToken(value);
}

async function verifyProfileOwnership(organizationId: string, profileId: string) {
  const { data, error } = await getSupabaseServer()
    .from("output_channel_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("organization_id", organizationId)
    .single();
  return !error && !!data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; profileId: string }> }
) {
  const { tenant, profileId } = await params;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.targetOrganization.id;

    const owned = await verifyProfileOwnership(organizationId, profileId);
    if (!owned) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data, error } = await getSupabaseServer()
      .from("output_profile_attribute_mappings")
      .select(
        "id,attribute_code,attribute_label,source_mode,source_field_code,override_field_code,source_slot_code,constant_value,resolution_rule,is_required,max_length,notes,sort_order,metadata"
      )
      .eq("profile_id", profileId)
      .order("sort_order", { ascending: true })
      .order("attribute_code", { ascending: true });

    if (error) {
      console.error("Failed to load destination attribute mappings:", error);
      return NextResponse.json({ error: "Failed to load destination attribute mappings" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    console.error("Unexpected error in GET /mappings:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; profileId: string }> }
) {
  const { tenant, profileId } = await params;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.tenantOrganization.id;

    const owned = await verifyProfileOwnership(organizationId, profileId);
    if (!owned) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mappingsInput = Array.isArray(body.mappings)
      ? body.mappings
      : body.attribute_code
        ? [body]
        : [];

    const normalized = mappingsInput
      .map((mapping, index) => {
        const row = mapping as Record<string, unknown>;
        const attributeCode = normalizeToken(row.attribute_code)?.toLowerCase();
        const attributeLabel = normalizeToken(row.attribute_label) ?? attributeCode ?? null;
        const sourceMode = normalizeToken(row.source_mode)?.toLowerCase() ?? "shared_field";
        const resolutionRule =
          normalizeToken(row.resolution_rule)?.toLowerCase() ?? "base_only";
        if (!attributeCode || !attributeLabel) return null;
        return {
          organization_id: organizationId,
          profile_id: profileId,
          attribute_code: attributeCode,
          attribute_label: attributeLabel,
          source_mode: sourceMode,
          source_field_code: normalizeNullableText(row.source_field_code)?.toLowerCase() ?? null,
          override_field_code: normalizeNullableText(row.override_field_code)?.toLowerCase() ?? null,
          source_slot_code: normalizeNullableText(row.source_slot_code)?.toLowerCase() ?? null,
          constant_value: normalizeNullableText(row.constant_value),
          resolution_rule: resolutionRule,
          is_required: typeof row.is_required === "boolean" ? row.is_required : false,
          max_length:
            typeof row.max_length === "number" && Number.isFinite(row.max_length) && row.max_length > 0
              ? Math.floor(row.max_length)
              : null,
          notes: normalizeNullableText(row.notes),
          sort_order:
            typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
              ? Math.floor(row.sort_order)
              : index * 10,
          metadata:
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? row.metadata
              : {},
        };
      })
      .filter(Boolean);

    if (normalized.length === 0) {
      return NextResponse.json({ error: "No valid mappings provided" }, { status: 400 });
    }

    const { data, error } = await getSupabaseServer()
      .from("output_profile_attribute_mappings")
      .upsert(normalized as never, {
        onConflict: "profile_id,attribute_code",
      })
      .select(
        "id,attribute_code,attribute_label,source_mode,source_field_code,override_field_code,source_slot_code,constant_value,resolution_rule,is_required,max_length,notes,sort_order,metadata"
      );

    if (error) {
      console.error("Failed to save destination attribute mappings:", error);
      return NextResponse.json({ error: "Failed to save destination attribute mappings" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    console.error("Unexpected error in POST /mappings:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; profileId: string }> }
) {
  const { tenant, profileId } = await params;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.tenantOrganization.id;

    const owned = await verifyProfileOwnership(organizationId, profileId);
    if (!owned) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const attributeCode = normalizeToken(
      request.nextUrl.searchParams.get("attribute_code")
    )?.toLowerCase();

    if (!attributeCode) {
      return NextResponse.json({ error: "attribute_code query param required" }, { status: 400 });
    }

    const { error } = await getSupabaseServer()
      .from("output_profile_attribute_mappings")
      .delete()
      .eq("profile_id", profileId)
      .eq("attribute_code", attributeCode)
      .eq("organization_id", organizationId);

    if (error) {
      console.error("Failed to delete destination attribute mapping:", error);
      return NextResponse.json({ error: "Failed to delete destination attribute mapping" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error in DELETE /mappings:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
