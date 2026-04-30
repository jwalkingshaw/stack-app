import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { getSupabaseServer } from "@/lib/supabase";
import {
  DEFAULT_UI_LOCALE,
  UI_LOCALE_COOKIE_NAME,
  normalizeUiLocale,
} from "@/lib/ui-locales";

type MemberPreferenceRow = {
  role: string;
  ui_locale_override: string | null;
};

function canManageWorkspaceDefault(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const access = await requireTenantAccess(request, tenant);
    if (!access.ok) return access.response;
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [organizationResult, memberResult] = await Promise.all([
      getSupabaseServer()
        .from("organizations")
        .select("default_ui_locale")
        .eq("id", access.organization.id)
        .single(),
      getSupabaseServer()
        .from("organization_members")
        .select("role,ui_locale_override")
        .eq("organization_id", access.organization.id)
        .eq("kinde_user_id", access.userId)
        .eq("status", "active")
        .single(),
    ]);

    if (organizationResult.error || memberResult.error || !memberResult.data) {
      return NextResponse.json(
        { error: "Failed to load workspace language preferences." },
        { status: 500 }
      );
    }

    const workspaceDefault =
      normalizeUiLocale(organizationResult.data.default_ui_locale) ?? DEFAULT_UI_LOCALE;
    const member = memberResult.data as MemberPreferenceRow;
    const overrideLocale = normalizeUiLocale(member.ui_locale_override);

    return NextResponse.json({
      preference: {
        uiLocaleOverride: overrideLocale,
        effectiveUiLocale: overrideLocale ?? workspaceDefault,
      },
      workspace: {
        defaultUiLocale: workspaceDefault,
      },
      permissions: {
        canManageWorkspaceDefault: canManageWorkspaceDefault(member.role),
      },
    });
  } catch (error) {
    console.error("Failed to load workspace preferences:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const access = await requireTenantAccess(request, tenant);
    if (!access.ok) return access.response;
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const hasOverrideProp = Object.prototype.hasOwnProperty.call(body, "uiLocaleOverride");
    if (!hasOverrideProp) {
      return NextResponse.json(
        { error: "uiLocaleOverride is required (set null to clear override)." },
        { status: 400 }
      );
    }

    const overrideCandidate = body.uiLocaleOverride;
    const normalizedOverride =
      overrideCandidate === null ||
      (typeof overrideCandidate === "string" && overrideCandidate.trim().length === 0)
        ? null
        : normalizeUiLocale(overrideCandidate);

    if (overrideCandidate !== null && normalizedOverride === null) {
      return NextResponse.json(
        { error: "uiLocaleOverride must be one of the supported UI locales or null." },
        { status: 400 }
      );
    }

    const { error: updateError } = await getSupabaseServer()
      .from("organization_members")
      .update({
        ui_locale_override: normalizedOverride,
      })
      .eq("organization_id", access.organization.id)
      .eq("kinde_user_id", access.userId)
      .eq("status", "active");

    if (updateError) {
      console.error("Failed to update member locale override:", updateError);
      return NextResponse.json(
        { error: "Failed to update language preference." },
        { status: 500 }
      );
    }

    const { data: organizationRow } = await getSupabaseServer()
      .from("organizations")
      .select("default_ui_locale")
      .eq("id", access.organization.id)
      .single();

    const workspaceDefault =
      normalizeUiLocale(organizationRow?.default_ui_locale) ?? DEFAULT_UI_LOCALE;
    const effectiveUiLocale = normalizedOverride ?? workspaceDefault;

    const response = NextResponse.json({
      preference: {
        uiLocaleOverride: normalizedOverride,
        effectiveUiLocale,
      },
    });

    response.cookies.set(UI_LOCALE_COOKIE_NAME, effectiveUiLocale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    console.error("Failed to update workspace preferences:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
