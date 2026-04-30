import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";


const VALID_PROFILE_TYPES = ["portal", "marketplace", "retail", "export", "api"] as const;
type ProfileType = (typeof VALID_PROFILE_TYPES)[number];

function normalizeCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidProfileType(value: unknown): value is ProfileType {
  return VALID_PROFILE_TYPES.includes(value as ProfileType);
}

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

// GET /api/[tenant]/output-profiles
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params;
  const selectedBrandSlug = request.nextUrl.searchParams.get("brand");

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.targetOrganization.id;

    const { data: profiles, error } = await getSupabaseServer()
      .from("output_channel_profiles")
      .select(`
        id, name, code, profile_type, description, market_id, is_active, is_primary, sort_order, metadata, created_at, updated_at,
        market:markets(id, name, code),
        field_rules:output_profile_field_rules(id, field_code, is_required, max_length, notes)
      `)
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching output profiles:", error);
      return NextResponse.json({ error: "Failed to fetch output profiles" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: profiles ?? [] });
  } catch (err) {
    console.error("Unexpected error in GET /output-profiles:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/output-profiles
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;

    if (isCrossTenantWrite(tenant, contextResult.context.selectedBrandSlug)) {
      return NextResponse.json({ error: "Cannot create profiles for a shared brand" }, { status: 403 });
    }

    const organizationId = contextResult.context.tenantOrganization.id;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = normalizeToken(body.name);
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const profileType = isValidProfileType(body.profile_type) ? body.profile_type : "portal";
    const code = normalizeToken(body.code)
      ? normalizeCode(String(body.code))
      : normalizeCode(name);
    const description = normalizeToken(body.description) ?? null;
    const marketId = normalizeToken(body.market_id) ?? null;

    const { data: profile, error } = await getSupabaseServer()
      .from("output_channel_profiles")
      .insert({
        organization_id: organizationId,
        name,
        code,
        profile_type: profileType,
        description,
        market_id: marketId,
        is_active: true,
        sort_order: 0,
        metadata: {},
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `A profile with code "${code}" already exists` },
          { status: 409 }
        );
      }
      console.error("Error creating output profile:", error);
      return NextResponse.json({ error: "Failed to create output profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: profile }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /output-profiles:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
