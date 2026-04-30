import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canUsePublicShareLinks, getOrganizationBillingLimits } from "@/lib/billing-policy";
import { requireTenantAccess } from "@/lib/tenant-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type RouteParams = { params: Promise<{ tenant: string; assetId: string }> };

type AssetShareRow = {
  id: string;
  organization_id: string;
  asset_id: string;
  token: string;
  public_enabled: boolean;
  allow_downloads: boolean;
  expires_at: string;
};

function buildShareUrl(request: NextRequest, params: { tenant: string; token: string }): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  const base = appUrl || new URL(request.url).origin;
  const root = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${root}/a/${params.tenant}/${params.token}`;
}

function defaultExpiryIso(): string {
  const next = new Date();
  next.setDate(next.getDate() + 30);
  return next.toISOString();
}

function generateShareToken(): string {
  return `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().slice(0, 8)}`;
}

async function issueUniqueToken(organizationId: string): Promise<string | null> {
  for (let i = 0; i < 10; i += 1) {
    const token = generateShareToken();
    const { data, error } = await supabase
      .from("asset_shares")
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
  assetId: string;
  userId: string;
}): Promise<{ ok: true; row: AssetShareRow } | { ok: false; status: number; error: string }> {
  const existing = await supabase
    .from("asset_shares")
    .select("id,organization_id,asset_id,token,public_enabled,allow_downloads,expires_at")
    .eq("organization_id", params.organizationId)
    .eq("asset_id", params.assetId)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, status: 500, error: "Failed to load asset share settings" };
  }
  if (existing.data) {
    return { ok: true, row: existing.data as AssetShareRow };
  }

  const token = await issueUniqueToken(params.organizationId);
  if (!token) {
    return { ok: false, status: 500, error: "Failed to generate asset share token" };
  }

  const inserted = await supabase
    .from("asset_shares")
    .insert({
      organization_id: params.organizationId,
      asset_id: params.assetId,
      token,
      public_enabled: false,
      allow_downloads: false,
      expires_at: defaultExpiryIso(),
      created_by: params.userId,
    })
    .select("id,organization_id,asset_id,token,public_enabled,allow_downloads,expires_at")
    .single();

  if (inserted.error || !inserted.data) {
    return { ok: false, status: 500, error: "Failed to initialize asset share settings" };
  }

  return { ok: true, row: inserted.data as AssetShareRow };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { tenant, assetId } = await params;

  const access = await requireTenantAccess(request, tenant);
  if (!access.ok) return access.response;
  const { organization, userId } = access;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: asset, error: assetError } = await supabase
    .from("dam_assets")
    .select("id")
    .eq("id", assetId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (assetError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const shareResult = await ensureShareRow({
    organizationId: organization.id,
    assetId,
    userId,
  });
  if (!shareResult.ok) {
    return NextResponse.json({ error: shareResult.error }, { status: shareResult.status });
  }

  const { planId } = await getOrganizationBillingLimits(organization.id);
  const publicShareAllowed = canUsePublicShareLinks(planId);

  return NextResponse.json({
    success: true,
    publicEnabled: publicShareAllowed ? Boolean(shareResult.row.public_enabled) : false,
    allowDownloads: Boolean(shareResult.row.allow_downloads),
    expiresAt: shareResult.row.expires_at,
    shareUrl: buildShareUrl(request, {
      tenant,
      token: shareResult.row.token,
    }),
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { tenant, assetId } = await params;

  const access = await requireTenantAccess(request, tenant);
  if (!access.ok) return access.response;
  const { organization, userId } = access;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: asset, error: assetError } = await supabase
    .from("dam_assets")
    .select("id")
    .eq("id", assetId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (assetError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const shareResult = await ensureShareRow({
    organizationId: organization.id,
    assetId,
    userId,
  });
  if (!shareResult.ok) {
    return NextResponse.json({ error: shareResult.error }, { status: shareResult.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    publicEnabled?: boolean;
    allowDownloads?: boolean;
  };

  if (body.action === "revoke") {
    const revoked = await supabase
      .from("asset_shares")
      .update({
        public_enabled: false,
        allow_downloads: false,
        expires_at: new Date().toISOString(),
      })
      .eq("organization_id", organization.id)
      .eq("asset_id", assetId)
      .select("id,organization_id,asset_id,token,public_enabled,allow_downloads,expires_at")
      .single();

    if (revoked.error || !revoked.data) {
      return NextResponse.json({ error: "Failed to revoke shares" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      publicEnabled: false,
      allowDownloads: false,
      expiresAt: revoked.data.expires_at,
      shareUrl: buildShareUrl(request, {
        tenant,
        token: revoked.data.token,
      }),
    });
  }

  const updatePayload: Record<string, unknown> = {};
  const { planId } = await getOrganizationBillingLimits(organization.id);

  if (Object.prototype.hasOwnProperty.call(body, "publicEnabled")) {
    if (typeof body.publicEnabled !== "boolean") {
      return NextResponse.json({ error: "publicEnabled must be a boolean" }, { status: 400 });
    }
    if (body.publicEnabled && !canUsePublicShareLinks(planId)) {
      return NextResponse.json(
        { error: "Public share links are unavailable on Free (Sandbox)." },
        { status: 403 }
      );
    }
    updatePayload.public_enabled = body.publicEnabled;
  }

  if (Object.prototype.hasOwnProperty.call(body, "allowDownloads")) {
    if (typeof body.allowDownloads !== "boolean") {
      return NextResponse.json({ error: "allowDownloads must be a boolean" }, { status: 400 });
    }
    updatePayload.allow_downloads = body.allowDownloads;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "No share settings provided" }, { status: 400 });
  }

  const updated = await supabase
    .from("asset_shares")
    .update(updatePayload)
    .eq("organization_id", organization.id)
    .eq("asset_id", assetId)
    .select("id,organization_id,asset_id,token,public_enabled,allow_downloads,expires_at")
    .single();

  if (updated.error || !updated.data) {
    return NextResponse.json({ error: "Failed to update share settings" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    publicEnabled: canUsePublicShareLinks(planId) ? Boolean(updated.data.public_enabled) : false,
    allowDownloads: Boolean(updated.data.allow_downloads),
    expiresAt: updated.data.expires_at,
    shareUrl: buildShareUrl(request, {
      tenant,
      token: updated.data.token,
    }),
  });
}
