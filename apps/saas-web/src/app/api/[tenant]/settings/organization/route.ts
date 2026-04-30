import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@stack-app/auth";
import { DatabaseQueries } from "@stack-app/database";
import { getSupabaseServer } from "@/lib/supabase";
import { requireTenantAccess } from "@/lib/tenant-auth";
import {
  applyOrganizationProfileUpdate,
  readOrganizationProfile,
} from "@/lib/organization-profile";
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from "@/lib/ui-locales";

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;

function normalizeWebsite(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function normalizeDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_DESCRIPTION_LENGTH);
}

function normalizeLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function canManageOrganizationSettings(
  userId: string | undefined,
  organizationId: string
): Promise<boolean> {
  if (!userId) return false;
  const db = new DatabaseQueries(getSupabaseServer());
  const authService = new AuthService(db);
  const permissions = await authService.getUserPermissions(userId, organizationId);
  return permissions.is_owner || permissions.is_admin;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const tenantAccess = await requireTenantAccess(request, tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization } = tenantAccess;
    const { data: organizationRow, error } = await getSupabaseServer()
      .from("organizations")
      .select("*")
      .eq("id", organization.id)
      .single();

    if (error || !organizationRow) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const profile = readOrganizationProfile(organizationRow as Record<string, unknown>);
    return NextResponse.json({
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organizationRow.name ?? organization.name,
        website: profile.website,
        description: profile.description,
        logoUrl: profile.logoUrl,
        defaultUiLocale:
          normalizeUiLocale((organizationRow as Record<string, unknown>).default_ui_locale) ??
          DEFAULT_UI_LOCALE,
      },
    });
  } catch (error) {
    console.error("Failed to load organization settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const tenantAccess = await requireTenantAccess(request, tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    const canManage = await canManageOrganizationSettings(userId, organization.id);
    if (!canManage) {
      return NextResponse.json(
        { error: "Only owners and admins can update organization settings." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const nextName =
      typeof body?.name === "string" ? body.name.trim() : organization.name;

    if (!nextName) {
      return NextResponse.json(
        { error: "Organization name is required." },
        { status: 400 }
      );
    }
    if (nextName.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Organization name cannot exceed ${MAX_NAME_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const websiteProvided = body?.website !== undefined;
    const descriptionProvided = body?.description !== undefined;
    const logoUrlProvided = body?.logoUrl !== undefined;

    const normalizedWebsite = websiteProvided ? normalizeWebsite(body.website) : undefined;
    if (websiteProvided && body.website && normalizedWebsite === null) {
      return NextResponse.json(
        { error: "Website must be a valid http(s) URL." },
        { status: 400 }
      );
    }

    const normalizedDescription = descriptionProvided
      ? normalizeDescription(body.description)
      : undefined;
    if (
      descriptionProvided &&
      typeof body.description === "string" &&
      body.description.trim().length > MAX_DESCRIPTION_LENGTH
    ) {
      return NextResponse.json(
        { error: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const normalizedLogoUrl = logoUrlProvided
      ? normalizeLogoUrl(body.logoUrl)
      : undefined;
    const defaultUiLocaleProvided = body?.defaultUiLocale !== undefined;
    const normalizedDefaultUiLocale = defaultUiLocaleProvided
      ? normalizeUiLocale(body.defaultUiLocale)
      : undefined;
    if (defaultUiLocaleProvided && !normalizedDefaultUiLocale) {
      return NextResponse.json(
        { error: "defaultUiLocale must be one of the supported UI locales." },
        { status: 400 }
      );
    }

    const { data: existingRow, error: existingError } = await getSupabaseServer()
      .from("organizations")
      .select("*")
      .eq("id", organization.id)
      .single();

    if (existingError || !existingRow) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 }
      );
    }

    const profileUpdates = applyOrganizationProfileUpdate({
      existingRow: existingRow as Record<string, unknown>,
      website: normalizedWebsite,
      description: normalizedDescription,
      logoUrl: normalizedLogoUrl,
    });
    const attemptedProfileUpdate =
      websiteProvided || descriptionProvided || logoUrlProvided;
    if (attemptedProfileUpdate && Object.keys(profileUpdates).length === 0) {
      return NextResponse.json(
        { error: "Organization schema does not currently support branding fields." },
        { status: 500 }
      );
    }

    const updatePayload: Record<string, unknown> = {
      ...profileUpdates,
    };
    if (nextName !== existingRow.name) {
      updatePayload.name = nextName;
    }
    if (normalizedDefaultUiLocale) {
      updatePayload.default_ui_locale = normalizedDefaultUiLocale;
    }

    if (Object.keys(updatePayload).length === 0) {
      const profile = readOrganizationProfile(existingRow as Record<string, unknown>);
      return NextResponse.json({
        organization: {
          id: existingRow.id,
          slug: existingRow.slug,
          name: existingRow.name,
          website: profile.website,
          description: profile.description,
          logoUrl: profile.logoUrl,
          defaultUiLocale:
            normalizeUiLocale((existingRow as Record<string, unknown>).default_ui_locale) ??
            DEFAULT_UI_LOCALE,
        },
      });
    }

    const { data: updatedRow, error: updateError } = await getSupabaseServer()
      .from("organizations")
      .update(updatePayload)
      .eq("id", organization.id)
      .select("*")
      .single();

    if (updateError || !updatedRow) {
      console.error("Failed to update organization settings:", updateError);
      return NextResponse.json(
        { error: "Failed to save organization settings." },
        { status: 500 }
      );
    }

    const updatedProfile = readOrganizationProfile(updatedRow as Record<string, unknown>);
    return NextResponse.json({
      organization: {
        id: updatedRow.id,
        slug: updatedRow.slug,
        name: updatedRow.name,
        website: updatedProfile.website,
        description: updatedProfile.description,
        logoUrl: updatedProfile.logoUrl,
        defaultUiLocale:
          normalizeUiLocale((updatedRow as Record<string, unknown>).default_ui_locale) ??
          DEFAULT_UI_LOCALE,
      },
    });
  } catch (error) {
    console.error("Failed to update organization settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
