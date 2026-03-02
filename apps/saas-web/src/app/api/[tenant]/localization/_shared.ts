import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { supabaseServer } from "@/lib/supabase";

type LocalizationMemberRole = "owner" | "admin" | "member" | null;

export type LocalizationAccessContext = {
  organization: {
    id: string;
    slug: string;
    name: string;
  };
  userId: string;
  role: LocalizationMemberRole;
};

export type LocalizationAccessResult =
  | { ok: true; context: LocalizationAccessContext }
  | { ok: false; response: NextResponse };

export function isMissingLocalizationFoundationError(error: any): boolean {
  if (!error) return false;
  if (error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("organization_localization_settings") ||
    message.includes("translation_jobs") ||
    message.includes("translation_job_items") ||
    message.includes("translation_glossaries") ||
    message.includes("translation_glossary_entries")
  );
}

export function isOwnerOrAdmin(role: LocalizationMemberRole): boolean {
  return role === "owner" || role === "admin";
}

export async function requireLocalizationAccess(
  request: NextRequest,
  tenant: string
): Promise<LocalizationAccessResult> {
  const tenantAccess = await requireTenantAccess(request, tenant);
  if (!tenantAccess.ok) {
    return { ok: false, response: tenantAccess.response };
  }

  const { organization, userId } = tenantAccess;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data, error } = await (supabaseServer as any)
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization.id)
    .eq("kinde_user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve localization access role:", error);
    return {
      ok: false,
      response: NextResponse.json({ error: "Failed to resolve access role" }, { status: 500 }),
    };
  }

  const role = (data?.role || null) as LocalizationMemberRole;
  if (!role) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Access denied" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    context: {
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
      },
      userId,
      role,
    },
  };
}
