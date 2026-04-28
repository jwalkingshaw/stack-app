import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { supabaseServer } from "@/lib/supabase";

const MANAGER_ROLES = new Set(["owner", "admin"]);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UpdatesContext = {
  organizationId: string;
  tenantSlug: string;
  userId: string;
  membershipRole: string;
};

type UpdatesAccessResult =
  | { ok: true; context: UpdatesContext }
  | { ok: false; response: NextResponse };

export function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (!normalized) continue;
    out.add(normalized);
  }
  return Array.from(out);
}

export function normalizeUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (!UUID_REGEX.test(normalized)) continue;
    out.add(normalized);
  }
  return Array.from(out);
}

export function normalizeJsonObject(
  value: unknown,
  fallback: Record<string, unknown> = {}
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  return value as Record<string, unknown>;
}

export function toIsoOrNull(value: unknown): string | null {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function getMembershipRole(params: {
  organizationId: string;
  userId: string;
}): Promise<string | null> {
  const { organizationId, userId } = params;

  const { data, error } = await supabaseServer
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("kinde_user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !data?.role) {
    return null;
  }

  return String(data.role).toLowerCase();
}

export async function requireUpdatesContext(
  request: NextRequest,
  tenantSlug: string,
  options?: { requireManager?: boolean }
): Promise<UpdatesAccessResult> {
  const tenantAccess = await requireTenantAccess(request, tenantSlug);
  if (!tenantAccess.ok) {
    return { ok: false, response: tenantAccess.response };
  }

  const userId = tenantAccess.userId;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const membershipRole = await getMembershipRole({
    organizationId: tenantAccess.organization.id,
    userId,
  });
  if (!membershipRole) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Access denied" }, { status: 403 }),
    };
  }

  const requireManager = Boolean(options?.requireManager);
  if (requireManager && !MANAGER_ROLES.has(membershipRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only workspace owners/admins can manage partner updates." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      organizationId: tenantAccess.organization.id,
      tenantSlug,
      userId,
      membershipRole,
    },
  };
}
