import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@stack-app/auth";
import { DatabaseQueries } from "@stack-app/database";
import type { Organization } from "@stack-app/types";
import { getSupabaseServer } from "@/lib/supabase";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { canManageContainerSharing } from "@/lib/security-permissions";

type SharingManagerContext = {
  organization: Organization;
  userId: string;
  authService: AuthService;
  db: DatabaseQueries;
};

export function isMissingTableError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { code?: string }).code === "42P01"
  );
}

export function isMissingColumnError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { code?: string }).code === "42703"
  );
}

export function normalizeUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    deduped.add(trimmed);
  }
  return Array.from(deduped);
}

export async function requireSharingManagerContext(
  request: NextRequest,
  tenant: string
): Promise<
  | { ok: true; context: SharingManagerContext }
  | { ok: false; response: NextResponse }
> {
  const db = new DatabaseQueries(getSupabaseServer());
  const authService = new AuthService(db);

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

  const allowed = await canManageContainerSharing({
    authService,
    userId,
    organizationId: organization.id,
  });

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Access denied. You must be an admin or owner to manage sharing." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      organization,
      userId,
      authService,
      db,
    },
  };
}
