import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireUpdatesContext } from "../../_shared";

type ShareRow = {
  id: string;
  organization_id: string;
  partner_update_id: string;
  token: string;
  public_enabled: boolean;
  expires_at: string;
};

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
  const { data, error } = await supabaseServer
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
    const { data, error } = await supabaseServer
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
  const { data, error } = await supabaseServer
    .from("partner_update_shares")
    .select("id,organization_id,partner_update_id,token,public_enabled,expires_at")
    .eq("organization_id", organizationId)
    .eq("partner_update_id", updateId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: "Failed to load update share settings" };
  if (data) return { ok: true, row: data as ShareRow };

  const token = await issueUniqueToken(organizationId);
  if (!token) {
    return { ok: false, status: 500, error: "Failed to generate share token" };
  }

  const { data: inserted, error: insertError } = await supabaseServer
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

  if (insertError || !inserted) {
    return { ok: false, status: 500, error: "Failed to initialize update share settings" };
  }

  return { ok: true, row: inserted as ShareRow };
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

    return NextResponse.json({
      success: true,
      publicEnabled: Boolean(shareResult.row.public_enabled),
      expiresAt: shareResult.row.expires_at,
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

    if (Object.prototype.hasOwnProperty.call(body, "publicEnabled")) {
      if (typeof body.publicEnabled !== "boolean") {
        return NextResponse.json({ error: "publicEnabled must be a boolean" }, { status: 400 });
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

    const { data: updated, error: updateError } = await supabaseServer
      .from("partner_update_shares")
      .update(updatePayload)
      .eq("organization_id", access.context.organizationId)
      .eq("partner_update_id", resolvedParams.updateId)
      .select("id,organization_id,partner_update_id,token,public_enabled,expires_at")
      .maybeSingle();

    if (updateError || !updated) {
      return NextResponse.json({ error: "Failed to update share settings" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      publicEnabled: Boolean((updated as ShareRow).public_enabled),
      expiresAt: String((updated as ShareRow).expires_at),
      shareUrl: buildShareUrl(request, {
        tenant: resolvedParams.tenant,
        token: String((updated as ShareRow).token),
      }),
    });
  } catch (error) {
    console.error("Error in update share PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
