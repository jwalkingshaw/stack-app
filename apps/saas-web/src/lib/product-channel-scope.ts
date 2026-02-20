import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthService } from "@tradetool/auth";

type ResolveChannelScopeParams = {
  authService: AuthService;
  supabase: SupabaseClient<any>;
  userId: string;
  organizationId: string;
  permissionKey: string;
  channelId?: string | null;
};

export type ChannelScopeResolution =
  | { ok: true; channelId: string | null }
  | { ok: false; response: NextResponse };

export async function resolveProductChannelScope(
  params: ResolveChannelScopeParams
): Promise<ChannelScopeResolution> {
  const { authService, supabase, userId, organizationId, permissionKey } = params;
  const channelId = params.channelId?.trim() || null;

  if (!channelId) {
    const hasOrgWide = await authService.hasScopedPermission({
      userId,
      organizationId,
      permissionKey,
    });
    if (!hasOrgWide) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "channel is required for this user scope." },
          { status: 403 }
        ),
      };
    }
    return { ok: true, channelId: null };
  }

  const { data: channel, error } = await (supabase as any)
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !channel) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Channel not found in this organization." },
        { status: 404 }
      ),
    };
  }

  const hasChannelPermission = await authService.hasScopedPermission({
    userId,
    organizationId,
    permissionKey,
    channelId,
  });
  if (!hasChannelPermission) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Access denied for the requested channel scope." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, channelId };
}

export async function getChannelScopedProductIds(params: {
  supabase: SupabaseClient<any>;
  organizationId: string;
  channelId: string | null;
}): Promise<string[] | null> {
  if (!params.channelId) {
    return null;
  }

  const { data, error } = await (params.supabase as any)
    .from("product_field_values")
    .select("product_id")
    .eq("organization_id", params.organizationId)
    .eq("channel", params.channelId);

  if (error || !data) {
    return [];
  }

  return Array.from(
    new Set(
      (data as any[])
        .map((row) => row.product_id)
        .filter((id: unknown): id is string => typeof id === "string")
    )
  );
}

