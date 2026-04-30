import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrganizationBillingLimits } from "@/lib/billing-policy";
import { getSupabaseServer } from "@/lib/supabase";
import { canUsePublicShareLinks } from "@/lib/billing-policy";
import { normalizeUuidArray, requireUpdatesContext } from "../../_shared";

type ShareRow = {
  id: string;
  organization_id: string;
  partner_update_id: string;
  token: string;
  public_enabled: boolean;
  expires_at: string;
  onboarding_share_set_ids?: string[] | null;
  onboarding_saved_scope_ids?: string[] | null;
};

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("onboarding_share_set_ids");
}

async function selectShareRow(params: {
  organizationId: string;
  updateId: string;
}): Promise<{ row: ShareRow | null; error: { code?: string; message?: string } | null }> {
  const withOnboarding = await getSupabaseServer()
    .from("partner_update_shares")
    .select("id,organization_id,partner_update_id,token,public_enabled,expires_at,onboarding_share_set_ids")
    .eq("organization_id", params.organizationId)
    .eq("partner_update_id", params.updateId)
    .maybeSingle();

  if (!withOnboarding.error) {
    return {
      row: withOnboarding.data ? (withOnboarding.data as unknown as ShareRow) : null,
      error: null,
    };
  }

  if (!isMissingColumnError(withOnboarding.error)) {
    return {
      row: null,
      error: {
        code: withOnboarding.error.code,
        message: withOnboarding.error.message,
      },
    };
  }

  const legacy = await getSupabaseServer()
    .from("partner_update_shares")
    .select("id,organization_id,partner_update_id,token,public_enabled,expires_at")
    .eq("organization_id", params.organizationId)
    .eq("partner_update_id", params.updateId)
    .maybeSingle();

  return {
    row: legacy.data
      ? ({ ...(legacy.data as unknown as ShareRow), onboarding_share_set_ids: [] } as ShareRow)
      : null,
    error: legacy.error
      ? {
          code: legacy.error.code,
          message: legacy.error.message,
        }
      : null,
  };
}

async function validateOnboardingShareSetIds(params: {
  organizationId: string;
  shareSetIds: string[];
}):
  Promise<{ ok: true; validatedIds: string[] } | { ok: false; status: number; error: string }> {
  const normalizedIds = Array.from(new Set(params.shareSetIds));
  if (normalizedIds.length === 0) {
    return { ok: true, validatedIds: [] };
  }

  const { data, error } = await getSupabaseServer()
    .from("share_sets")
    .select("id,module_key")
    .eq("organization_id", params.organizationId)
    .in("id", normalizedIds)
    .in("module_key", ["assets", "products"]);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return {
        ok: false,
        status: 503,
        error: "Saved scope tables are unavailable. Apply database migrations first.",
      };
    }
    return {
      ok: false,
      status: 500,
      error: "Failed to validate onboarding saved scopes",
    };
  }

  const foundIds = new Set(
    ((data || []) as Array<{ id: string | null }>)
      .map((row) => String(row.id || "").trim())
      .filter(Boolean)
  );

  if (foundIds.size !== normalizedIds.length) {
    return {
      ok: false,
      status: 400,
      error: "One or more onboarding saved scopes are invalid for this workspace.",
    };
  }

  return { ok: true, validatedIds: normalizedIds };
}

function buildShareUrl(request: NextRequest, params: { tenant: string; token: string }): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  const base = appUrl || new URL(request.url).origin;
  const root = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${root}/u/${params.tenant}/${params.token}`;
}

function defaultExpiryIso(): string {
  const next = new Date();
  next.setDate(next.getDate() + 30);
  return next.toISOString();
}

function generateShareToken(): string {
  return `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().slice(0, 8)}`;
}

async function ensureUpdateExists(params: {
  organizationId: string;
  updateId: string;
}) {
  const { data, error } = await getSupabaseServer()
    .from("partner_updates")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.updateId)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500, error: "Failed to resolve update" };
  if (!data) return { ok: false as const, status: 404, error: "Partner update not found" };
  return { ok: true as const };
}

async function issueUniqueToken(organizationId: string): Promise<string | null> {
  for (let i = 0; i < 10; i += 1) {
    const token = generateShareToken();
    const { data, error } = await getSupabaseServer()
      .from("partner_update_shares")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("token", token)
      .maybeSingle();
    if (error) return null;
    if (!data) return token;
  }
  return null;
}

async function ensureShareRow(params: {
  organizationId: string;
  updateId: string;
  userId: string;
}): Promise<{ ok: true; row: ShareRow } | { ok: false; status: number; error: string }> {
  const { organizationId, updateId, userId } = params;
  const existing = await selectShareRow({
    organizationId,
    updateId,
  });

  if (existing.error) return { ok: false, status: 500, error: "Failed to load update share settings" };
  if (existing.row) return { ok: true, row: existing.row };

  const token = await issueUniqueToken(organizationId);
  if (!token) {
    return { ok: false, status: 500, error: "Failed to generate share token" };
  }

  const { data: inserted, error: insertError } = await getSupabaseServer()
    .from("partner_update_shares")
    .insert({
      organization_id: organizationId,
      partner_update_id: updateId,
      token,
      public_enabled: false,
      expires_at: defaultExpiryIso(),
      created_by: userId,
    })
    .select("id,organization_id,partner_update_id,token,public_enabled,expires_at,onboarding_share_set_ids")
    .maybeSingle();

  if (insertError && isMissingColumnError(insertError)) {
    const legacyInsert = await getSupabaseServer()
      .from("partner_update_shares")
      .insert({
        organization_id: organizationId,
        partner_update_id: updateId,
        token,
        public_enabled: false,
        expires_at: defaultExpiryIso(),
        created_by: userId,
      })
      .select("id,organization_id,partner_update_id,token,public_enabled,expires_at")
      .maybeSingle();

    if (legacyInsert.error || !legacyInsert.data) {
      return { ok: false, status: 500, error: "Failed to initialize update share settings" };
    }

    return {
      ok: true,
      row: {
        ...(legacyInsert.data as unknown as ShareRow),
        onboarding_share_set_ids: [],
      },
    };
  }

  if (insertError || !inserted) {
    return { ok: false, status: 500, error: "Failed to initialize update share settings" };
  }

  return { ok: true, row: inserted as unknown as ShareRow };
}

// GET /api/[tenant]/updates/[updateId]/share
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant, {
      requireManager: true,
    });
    if (!access.ok) return access.response;

    const updateExists = await ensureUpdateExists({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
    });
    if (!updateExists.ok) {
      return NextResponse.json({ error: updateExists.error }, { status: updateExists.status });
    }

    const shareResult = await ensureShareRow({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      userId: access.context.userId,
    });
    if (!shareResult.ok) {
      return NextResponse.json({ error: shareResult.error }, { status: shareResult.status });
    }

    const { planId } = await getOrganizationBillingLimits(access.context.organizationId);
    const publicShareAllowed = canUsePublicShareLinks(planId);

    return NextResponse.json({
      success: true,
      publicEnabled: publicShareAllowed ? Boolean(shareResult.row.public_enabled) : false,
      expiresAt: shareResult.row.expires_at,
      onboardingShareSetIds: normalizeUuidArray(shareResult.row.onboarding_share_set_ids || []),
      onboardingSavedScopeIds: normalizeUuidArray(shareResult.row.onboarding_share_set_ids || []),
      shareUrl: buildShareUrl(request, {
        tenant: resolvedParams.tenant,
        token: shareResult.row.token,
      }),
    });
  } catch (error) {
    console.error("Error in update share GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/[tenant]/updates/[updateId]/share
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant, {
      requireManager: true,
    });
    if (!access.ok) return access.response;

    const updateExists = await ensureUpdateExists({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
    });
    if (!updateExists.ok) {
      return NextResponse.json({ error: updateExists.error }, { status: updateExists.status });
    }

    const shareResult = await ensureShareRow({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      userId: access.context.userId,
    });
    if (!shareResult.ok) {
      return NextResponse.json({ error: shareResult.error }, { status: shareResult.status });
    }

    const body = await request.json().catch(() => ({}));
    const updatePayload: Record<string, unknown> = {};
    let onboardingShareSetIdsResponse = normalizeUuidArray(
      shareResult.row.onboarding_share_set_ids || []
    );
    const { planId } = await getOrganizationBillingLimits(access.context.organizationId);
    const publicShareAllowed = canUsePublicShareLinks(planId);

    if (Object.prototype.hasOwnProperty.call(body, "publicEnabled")) {
      if (typeof body.publicEnabled !== "boolean") {
        return NextResponse.json({ error: "publicEnabled must be a boolean" }, { status: 400 });
      }
      if (body.publicEnabled) {
        if (!publicShareAllowed) {
          return NextResponse.json(
            { error: "Public share links are unavailable on Free (Sandbox)." },
            { status: 403 }
          );
        }
      }
      updatePayload.public_enabled = body.publicEnabled;
    }

    if (Object.prototype.hasOwnProperty.call(body, "expiresAt")) {
      if (typeof body.expiresAt !== "string") {
        return NextResponse.json({ error: "expiresAt must be an ISO date string" }, { status: 400 });
      }
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "expiresAt must be a valid datetime" }, { status: 400 });
      }
      if (parsed.getTime() <= Date.now()) {
        return NextResponse.json({ error: "expiresAt must be in the future" }, { status: 400 });
      }
      updatePayload.expires_at = parsed.toISOString();
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "onboardingSavedScopeIds") ||
      Object.prototype.hasOwnProperty.call(body, "onboarding_saved_scope_ids") ||
      Object.prototype.hasOwnProperty.call(body, "onboardingShareSetIds") ||
      Object.prototype.hasOwnProperty.call(body, "onboarding_share_set_ids")
    ) {
      const rawOnboardingShareSetIds =
        body.onboardingSavedScopeIds ??
        body.onboarding_saved_scope_ids ??
        body.onboardingShareSetIds ??
        body.onboarding_share_set_ids;
      if (!Array.isArray(rawOnboardingShareSetIds)) {
        return NextResponse.json(
          { error: "onboardingSavedScopeIds must be an array of UUIDs" },
          { status: 400 }
        );
      }

      const normalizedOnboardingShareSetIds = normalizeUuidArray(rawOnboardingShareSetIds);
      const validation = await validateOnboardingShareSetIds({
        organizationId: access.context.organizationId,
        shareSetIds: normalizedOnboardingShareSetIds,
      });
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }
      updatePayload.onboarding_share_set_ids = validation.validatedIds;
      onboardingShareSetIdsResponse = validation.validatedIds;
    }

    if (Object.prototype.hasOwnProperty.call(body, "regenerateToken")) {
      if (body.regenerateToken !== true && body.regenerateToken !== false) {
        return NextResponse.json({ error: "regenerateToken must be a boolean" }, { status: 400 });
      }
      if (body.regenerateToken) {
        const token = await issueUniqueToken(access.context.organizationId);
        if (!token) {
          return NextResponse.json({ error: "Failed to generate new token" }, { status: 500 });
        }
        updatePayload.token = token;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No share settings provided" }, { status: 400 });
    }

    const updateQuery = getSupabaseServer()
      .from("partner_update_shares")
      .update(updatePayload)
      .eq("organization_id", access.context.organizationId)
      .eq("partner_update_id", resolvedParams.updateId);

    let updatedResult = await updateQuery
      .select("id,organization_id,partner_update_id,token,public_enabled,expires_at,onboarding_share_set_ids")
      .maybeSingle();

    if (updatedResult.error && isMissingColumnError(updatedResult.error)) {
      if (Object.prototype.hasOwnProperty.call(updatePayload, "onboarding_share_set_ids")) {
        return NextResponse.json(
          { error: "Share link onboarding saved scopes are unavailable until latest migrations are applied." },
          { status: 503 }
        );
      }

      updatedResult = await updateQuery
        .select("id,organization_id,partner_update_id,token,public_enabled,expires_at")
        .maybeSingle();
    }

    if (updatedResult.error || !updatedResult.data) {
      return NextResponse.json({ error: "Failed to update share settings" }, { status: 500 });
    }

    const updated = updatedResult.data as unknown as ShareRow;

    return NextResponse.json({
      success: true,
      publicEnabled: publicShareAllowed ? Boolean(updated.public_enabled) : false,
      expiresAt: String(updated.expires_at),
      onboardingShareSetIds: normalizeUuidArray(
        updated.onboarding_share_set_ids || onboardingShareSetIdsResponse
      ),
      onboardingSavedScopeIds: normalizeUuidArray(
        updated.onboarding_share_set_ids || onboardingShareSetIdsResponse
      ),
      shareUrl: buildShareUrl(request, {
        tenant: resolvedParams.tenant,
        token: String(updated.token),
      }),
    });
  } catch (error) {
    console.error("Error in update share PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
