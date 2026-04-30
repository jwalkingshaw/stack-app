import { NextRequest, NextResponse } from "next/server";
import {
  resolvePartnerSharedBrandOrganizationIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";
import { getSupabaseServer } from "@/lib/supabase";

type ScopeContext =
  | {
      ok: true;
      tenantSlug: string;
      partnerOrganizationId: string;
      selectedBrandSlug: string | null;
      allowedBrandOrganizationIds: string[];
      userId: string;
    }
  | { ok: false; response: NextResponse };

function normalizeScope(scope: string, tenantSlug: string): string | null {
  const normalizedScope = (scope || "").trim().toLowerCase();
  const normalizedTenant = (tenantSlug || "").trim().toLowerCase();
  if (
    !normalizedScope ||
    normalizedScope === "all" ||
    normalizedScope === "self" ||
    normalizedScope === normalizedTenant
  ) {
    return null;
  }
  return normalizedScope;
}

export function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function requirePartnerUpdatesScopeContext(params: {
  request: NextRequest;
  tenantSlug: string;
  scope: string;
}): Promise<ScopeContext> {
  const selectedBrandSlug = normalizeScope(params.scope, params.tenantSlug);
  const contextResult = await resolveTenantBrandViewContext({
    request: params.request,
    tenantSlug: params.tenantSlug,
    selectedBrandSlug,
  });
  if (!contextResult.ok) {
    return { ok: false, response: contextResult.response };
  }

  const context = contextResult.context;
  if (context.tenantOrganization.organizationType !== "partner") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Partner workspace is required for this endpoint." },
        { status: 403 }
      ),
    };
  }

  let allowedBrandOrganizationIds: string[] = [];
  if (context.mode === "partner_brand") {
    allowedBrandOrganizationIds = [context.targetOrganization.id];
  } else {
    allowedBrandOrganizationIds = await resolvePartnerSharedBrandOrganizationIds({
      partnerOrganizationId: context.tenantOrganization.id,
    });
  }

  return {
    ok: true,
    tenantSlug: context.tenantOrganization.slug,
    partnerOrganizationId: context.tenantOrganization.id,
    selectedBrandSlug: context.selectedBrandSlug,
    allowedBrandOrganizationIds: allowedBrandOrganizationIds.filter(Boolean),
    userId: context.userId,
  };
}

export async function ensurePartnerUpdateRecipient(params: {
  updateId: string;
  partnerOrganizationId: string;
  allowedBrandOrganizationIds: string[];
}) {
  if (params.allowedBrandOrganizationIds.length === 0) {
    return {
      ok: false as const,
      status: 404,
      error: "Update not found",
    };
  }

  const { data, error } = await getSupabaseServer()
    .from("partner_update_recipients")
    .select(
      "id,organization_id,partner_update_id,partner_organization_id,delivery_channels,status,first_notified_at,opened_at,acknowledged_at,activated_at,due_at,metadata,created_at,updated_at"
    )
    .eq("partner_update_id", params.updateId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .in("organization_id", params.allowedBrandOrganizationIds)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      status: 500,
      error: "Failed to resolve update recipient",
    };
  }
  if (!data) {
    // Fallback: if partner has an active relationship, auto-create the recipient row.
    // This handles cases where the share-link accept flow failed to insert the row.
    const { data: updateRow } = await getSupabaseServer()
      .from("partner_updates")
      .select("id,organization_id")
      .eq("id", params.updateId)
      .in("organization_id", params.allowedBrandOrganizationIds)
      .eq("status", "published")
      .maybeSingle();

    if (!updateRow) {
      return {
        ok: false as const,
        status: 404,
        error: "Update not found",
      };
    }

    const brandOrgId = String(updateRow.organization_id);
    const nowIso = new Date().toISOString();
    const { data: created, error: createError } = await getSupabaseServer()
      .from("partner_update_recipients")
      .insert({
        organization_id: brandOrgId,
        partner_update_id: params.updateId,
        partner_organization_id: params.partnerOrganizationId,
        status: "opened",
        delivery_channels: ["share_link"],
        opened_at: nowIso,
        metadata: { source: "auto_recover" },
      })
      .select(
        "id,organization_id,partner_update_id,partner_organization_id,delivery_channels,status,first_notified_at,opened_at,acknowledged_at,activated_at,due_at,metadata,created_at,updated_at"
      )
      .single();

    if (createError || !created) {
      console.error("Failed to auto-create partner_update_recipients row:", createError);
      return {
        ok: false as const,
        status: 404,
        error: "Update not found",
      };
    }

    const r = created as Record<string, unknown>;
    return {
      ok: true as const,
      recipient: {
        id: String(r.id),
        organizationId: String(r.organization_id),
        partnerUpdateId: String(r.partner_update_id),
        partnerOrganizationId: String(r.partner_organization_id),
        deliveryChannels: Array.isArray(r.delivery_channels) ? (r.delivery_channels as string[]) : [],
        status: String(r.status || "opened"),
        firstNotifiedAt: r.first_notified_at ? String(r.first_notified_at) : null,
        openedAt: r.opened_at ? String(r.opened_at) : null,
        acknowledgedAt: r.acknowledged_at ? String(r.acknowledged_at) : null,
        activatedAt: r.activated_at ? String(r.activated_at) : null,
        dueAt: r.due_at ? String(r.due_at) : null,
        metadata: r.metadata && typeof r.metadata === "object" ? r.metadata as Record<string, unknown> : {},
        createdAt: r.created_at ? String(r.created_at) : null,
        updatedAt: r.updated_at ? String(r.updated_at) : null,
      },
    };
  }

  return {
    ok: true as const,
    recipient: {
      id: String(data.id),
      organizationId: String(data.organization_id),
      partnerUpdateId: String(data.partner_update_id),
      partnerOrganizationId: String(data.partner_organization_id),
      deliveryChannels: Array.isArray(data.delivery_channels)
        ? (data.delivery_channels as string[])
        : [],
      status: String(data.status || "queued"),
      firstNotifiedAt: data.first_notified_at ? String(data.first_notified_at) : null,
      openedAt: data.opened_at ? String(data.opened_at) : null,
      acknowledgedAt: data.acknowledged_at ? String(data.acknowledged_at) : null,
      activatedAt: data.activated_at ? String(data.activated_at) : null,
      dueAt: data.due_at ? String(data.due_at) : null,
      metadata:
        data.metadata && typeof data.metadata === "object" ? data.metadata : {},
      createdAt: data.created_at ? String(data.created_at) : null,
      updatedAt: data.updated_at ? String(data.updated_at) : null,
    },
  };
}
