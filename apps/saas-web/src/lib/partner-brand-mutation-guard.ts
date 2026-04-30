import { NextRequest, NextResponse } from "next/server";
import type { TenantBrandViewContext } from "@/lib/partner-brand-view";
import { logSecurityEvent } from "@/lib/security-audit";
import { getSupabaseServer } from "@/lib/supabase";

type PartnerBrandMutationGuardParams = {
  request: NextRequest;
  context: TenantBrandViewContext;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function blockPartnerBrandMutation(
  params: PartnerBrandMutationGuardParams
): Promise<NextResponse | null> {
  if (params.context.mode !== "partner_brand") {
    return null;
  }

  try {
    await logSecurityEvent(getSupabaseServer(), {
      organizationId: params.context.targetOrganization.id,
      actorUserId: params.context.userId,
      action: "security.partner_brand_mutation_blocked",
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      userAgent: params.request.headers.get("user-agent"),
      metadata: {
        attempted_action: params.action,
        method: params.request.method,
        path: new URL(params.request.url).pathname,
        tenant_organization_id: params.context.tenantOrganization.id,
        tenant_organization_slug: params.context.tenantOrganization.slug,
        selected_brand_slug: params.context.selectedBrandSlug,
        ...(params.metadata || {}),
      },
    });
  } catch (error) {
    console.error("Failed to write partner-brand mutation audit log:", error);
  }

  return NextResponse.json(
    {
      error:
        "This view is read-only. Switch back to your own workspace to perform edits.",
    },
    { status: 403 }
  );
}
