import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_PROFILE_TYPES = ["portal", "marketplace", "retail", "export", "api"] as const;
type ProfileType = (typeof VALID_PROFILE_TYPES)[number];

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidProfileType(value: unknown): value is ProfileType {
  return VALID_PROFILE_TYPES.includes(value as ProfileType);
}

async function resolveProfile(organizationId: string, profileId: string) {
  const { data, error } = await supabase
    .from("output_channel_profiles")
    .select(`
      id, organization_id, name, code, profile_type, description,
      market_id, is_active, is_primary, sort_order, metadata, created_at, updated_at,
      market:markets(id, name, code),
      field_rules:output_profile_field_rules(id, field_code, is_required, max_length, notes)
    `)
    .eq("id", profileId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) return null;
  return data;
}

// GET /api/[tenant]/output-profiles/[profileId]
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

    const profile = await resolveProfile(organizationId, profileId);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    console.error("Unexpected error in GET /output-profiles/[profileId]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/[tenant]/output-profiles/[profileId]
export async function PATCH(
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

    const existing = await resolveProfile(organizationId, profileId);
    if (!existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = normalizeToken(body.name);
      if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      patch.name = name;
    }
    if (typeof body.description !== "undefined") {
      patch.description = normalizeToken(body.description);
    }
    if (isValidProfileType(body.profile_type)) {
      patch.profile_type = body.profile_type;
    }
    if (typeof body.market_id !== "undefined") {
      patch.market_id = normalizeToken(body.market_id);
    }
    if (typeof body.is_active === "boolean") {
      patch.is_active = body.is_active;
    }
    if (typeof body.sort_order === "number") {
      patch.sort_order = Math.max(0, Math.floor(body.sort_order));
    }
    if (typeof body.is_primary === "boolean") {
      patch.is_primary = body.is_primary;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, data: existing });
    }

    // When promoting this profile to primary, clear the flag on all other profiles first
    if (patch.is_primary === true) {
      await supabase
        .from("output_channel_profiles")
        .update({ is_primary: false })
        .eq("organization_id", organizationId)
        .neq("id", profileId);
    }

    const { data: updated, error } = await supabase
      .from("output_channel_profiles")
      .update(patch)
      .eq("id", profileId)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) {
      console.error("Error updating output profile:", error);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("Unexpected error in PATCH /output-profiles/[profileId]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/output-profiles/[profileId]
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

    const { error } = await supabase
      .from("output_channel_profiles")
      .delete()
      .eq("id", profileId)
      .eq("organization_id", organizationId);

    if (error) {
      console.error("Error deleting output profile:", error);
      return NextResponse.json({ error: "Failed to delete profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error in DELETE /output-profiles/[profileId]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
