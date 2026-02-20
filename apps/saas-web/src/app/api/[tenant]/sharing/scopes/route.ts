import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingTableError,
  requireSharingManagerContext,
} from "../_shared";
import {
  isShareablePermissionKey,
  parseShareScopeType,
} from "@/lib/container-sharing";

type ScopeGrantRow = {
  id: string;
  member_id: string;
  permission_key: string;
  scope_type: "market" | "channel" | "collection";
  market_id: string | null;
  channel_id: string | null;
  collection_id: string | null;
  expires_at: string | null;
};

async function loadScopeMaps(params: {
  organizationId: string;
  marketIds: string[];
  channelIds: string[];
  collectionIds: string[];
}) {
  const { organizationId, marketIds, channelIds, collectionIds } = params;

  const [marketsResult, channelsResult, collectionsResult] = await Promise.all([
    marketIds.length > 0
      ? (supabaseServer as any)
          .from("markets")
          .select("id,name,code")
          .eq("organization_id", organizationId)
          .in("id", marketIds)
      : Promise.resolve({ data: [], error: null }),
    channelIds.length > 0
      ? (supabaseServer as any)
          .from("channels")
          .select("id,name,code")
          .eq("organization_id", organizationId)
          .in("id", channelIds)
      : Promise.resolve({ data: [], error: null }),
    collectionIds.length > 0
      ? (supabaseServer as any)
          .from("dam_collections")
          .select("id,name")
          .eq("organization_id", organizationId)
          .in("id", collectionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (marketsResult.error && !isMissingTableError(marketsResult.error)) {
    throw new Error("Failed to load market scope labels");
  }
  if (channelsResult.error && !isMissingTableError(channelsResult.error)) {
    throw new Error("Failed to load channel scope labels");
  }
  if (collectionsResult.error && !isMissingTableError(collectionsResult.error)) {
    throw new Error("Failed to load collection scope labels");
  }

  const marketMap = new Map<string, { id: string; name: string; code?: string | null }>();
  const channelMap = new Map<string, { id: string; name: string; code?: string | null }>();
  const collectionMap = new Map<string, { id: string; name: string }>();

  for (const row of (marketsResult.data || []) as any[]) {
    marketMap.set(row.id, { id: row.id, name: row.name, code: row.code ?? null });
  }
  for (const row of (channelsResult.data || []) as any[]) {
    channelMap.set(row.id, { id: row.id, name: row.name, code: row.code ?? null });
  }
  for (const row of (collectionsResult.data || []) as any[]) {
    collectionMap.set(row.id, { id: row.id, name: row.name });
  }

  return { marketMap, channelMap, collectionMap };
}

// GET /api/[tenant]/sharing/scopes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;

    const { data, error } = await (supabaseServer as any)
      .from("member_scope_permissions")
      .select(
        "id,member_id,permission_key,scope_type,market_id,channel_id,collection_id,expires_at,created_at"
      )
      .eq("organization_id", organization.id)
      .in("scope_type", ["market", "channel", "collection"])
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to load scope grants" }, { status: 500 });
    }

    const grants = (data || []) as ScopeGrantRow[];
    const marketIds = Array.from(
      new Set(grants.map((row) => row.market_id).filter((id): id is string => Boolean(id)))
    );
    const channelIds = Array.from(
      new Set(grants.map((row) => row.channel_id).filter((id): id is string => Boolean(id)))
    );
    const collectionIds = Array.from(
      new Set(grants.map((row) => row.collection_id).filter((id): id is string => Boolean(id)))
    );

    const { marketMap, channelMap, collectionMap } = await loadScopeMaps({
      organizationId: organization.id,
      marketIds,
      channelIds,
      collectionIds,
    });

    const payload = grants.map((grant) => ({
      ...grant,
      market: grant.market_id ? marketMap.get(grant.market_id) || null : null,
      channel: grant.channel_id ? channelMap.get(grant.channel_id) || null : null,
      collection: grant.collection_id
        ? collectionMap.get(grant.collection_id) || null
        : null,
    }));

    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    console.error("Error in sharing scopes GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/sharing/scopes
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const body = await request.json().catch(() => ({}));

    const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
    const permissionKey =
      typeof body.permissionKey === "string" ? body.permissionKey.trim() : "";
    const parsedScopeType = parseShareScopeType(body.scopeType);
    const marketId = typeof body.marketId === "string" ? body.marketId.trim() : null;
    const channelId = typeof body.channelId === "string" ? body.channelId.trim() : null;
    const collectionId =
      typeof body.collectionId === "string" ? body.collectionId.trim() : null;
    const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : null;

    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }
    if (!permissionKey || !isShareablePermissionKey(permissionKey)) {
      return NextResponse.json({ error: "Invalid permission key" }, { status: 400 });
    }
    if (!parsedScopeType) {
      return NextResponse.json({ error: "Invalid scope type" }, { status: 400 });
    }

    if (parsedScopeType === "market" && !marketId) {
      return NextResponse.json({ error: "marketId is required for market scope" }, { status: 400 });
    }
    if (parsedScopeType === "channel" && !channelId) {
      return NextResponse.json({ error: "channelId is required for channel scope" }, { status: 400 });
    }
    if (parsedScopeType === "collection" && !collectionId) {
      return NextResponse.json(
        { error: "collectionId is required for collection scope" },
        { status: 400 }
      );
    }

    const { data: member, error: memberError } = await (supabaseServer as any)
      .from("organization_members")
      .select("id")
      .eq("id", memberId)
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .maybeSingle();
    if (memberError || !member) {
      return NextResponse.json({ error: "Member not found in this organization" }, { status: 404 });
    }

    if (parsedScopeType === "market") {
      const { data: market, error: marketError } = await (supabaseServer as any)
        .from("markets")
        .select("id")
        .eq("id", marketId)
        .eq("organization_id", organization.id)
        .maybeSingle();
      if (marketError || !market) {
        return NextResponse.json({ error: "Market not found in this organization" }, { status: 404 });
      }
    }

    if (parsedScopeType === "channel") {
      const { data: channel, error: channelError } = await (supabaseServer as any)
        .from("channels")
        .select("id")
        .eq("id", channelId)
        .eq("organization_id", organization.id)
        .maybeSingle();
      if (channelError || !channel) {
        return NextResponse.json({ error: "Channel not found in this organization" }, { status: 404 });
      }
    }

    if (parsedScopeType === "collection") {
      const { data: collection, error: collectionError } = await (supabaseServer as any)
        .from("dam_collections")
        .select("id")
        .eq("id", collectionId)
        .eq("organization_id", organization.id)
        .maybeSingle();
      if (collectionError || !collection) {
        return NextResponse.json(
          { error: "Shared set not found in this organization" },
          { status: 404 }
        );
      }
    }

    let existingQuery = (supabaseServer as any)
      .from("member_scope_permissions")
      .select("id,market_id,channel_id,collection_id")
      .eq("organization_id", organization.id)
      .eq("member_id", memberId)
      .eq("permission_key", permissionKey)
      .eq("scope_type", parsedScopeType);

    if (parsedScopeType === "market") {
      existingQuery = existingQuery
        .eq("market_id", marketId)
        .is("channel_id", null)
        .is("collection_id", null);
    } else if (parsedScopeType === "channel") {
      existingQuery = existingQuery
        .is("market_id", null)
        .eq("channel_id", channelId)
        .is("collection_id", null);
    } else {
      existingQuery = existingQuery
        .is("market_id", null)
        .is("channel_id", null)
        .eq("collection_id", collectionId);
    }

    const { data: existing, error: existingError } = await existingQuery;

    if (existingError) {
      return NextResponse.json({ error: "Failed to resolve existing scope grant" }, { status: 500 });
    }

    const targetMatch = (existing || [])[0] || null;

    let grantId: string | null = null;

    if (targetMatch?.id) {
      const { data: updated, error: updateError } = await (supabaseServer as any)
        .from("member_scope_permissions")
        .update({
          expires_at: expiresAt,
          granted_by: userId,
        })
        .eq("id", targetMatch.id)
        .select(
          "id,member_id,permission_key,scope_type,market_id,channel_id,collection_id,expires_at"
        )
        .single();

      if (updateError || !updated) {
        return NextResponse.json({ error: "Failed to update scope grant" }, { status: 500 });
      }
      grantId = updated.id;
    } else {
      const { data: inserted, error: insertError } = await (supabaseServer as any)
        .from("member_scope_permissions")
        .insert({
          organization_id: organization.id,
          member_id: memberId,
          permission_key: permissionKey,
          scope_type: parsedScopeType,
          market_id: parsedScopeType === "market" ? marketId : null,
          channel_id: parsedScopeType === "channel" ? channelId : null,
          collection_id: parsedScopeType === "collection" ? collectionId : null,
          expires_at: expiresAt,
          granted_by: userId,
        })
        .select(
          "id,member_id,permission_key,scope_type,market_id,channel_id,collection_id,expires_at"
        )
        .single();

      if (insertError || !inserted) {
        return NextResponse.json({ error: "Failed to create scope grant" }, { status: 500 });
      }
      grantId = inserted.id;
    }

    try {
      await (supabaseServer as any).rpc("log_security_event", {
        organization_id_param: organization.id,
        actor_user_id_param: userId,
        action_param: "container.share.granted",
        resource_type_param: "member_scope_permission",
        resource_id_param: grantId,
        user_agent_param: request.headers.get("user-agent"),
        metadata_param: {
          member_id: memberId,
          permission_key: permissionKey,
          scope_type: parsedScopeType,
          market_id: parsedScopeType === "market" ? marketId : null,
          channel_id: parsedScopeType === "channel" ? channelId : null,
          collection_id: parsedScopeType === "collection" ? collectionId : null,
        },
      });
    } catch (auditError) {
      console.warn("Failed to write container.share.granted audit event:", auditError);
    }

    return NextResponse.json({ success: true, data: { id: grantId } }, { status: 201 });
  } catch (error) {
    console.error("Error in sharing scopes POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/sharing/scopes?grantId=...
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const { searchParams } = new URL(request.url);
    const grantId = searchParams.get("grantId")?.trim();

    if (!grantId) {
      return NextResponse.json({ error: "grantId is required" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await (supabaseServer as any)
      .from("member_scope_permissions")
      .select(
        "id,member_id,permission_key,scope_type,market_id,channel_id,collection_id"
      )
      .eq("id", grantId)
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (existingError || !existing) {
      return NextResponse.json({ error: "Scope grant not found" }, { status: 404 });
    }

    const { error: deleteError } = await (supabaseServer as any)
      .from("member_scope_permissions")
      .delete()
      .eq("id", grantId)
      .eq("organization_id", organization.id);

    if (deleteError) {
      return NextResponse.json({ error: "Failed to revoke scope grant" }, { status: 500 });
    }

    try {
      await (supabaseServer as any).rpc("log_security_event", {
        organization_id_param: organization.id,
        actor_user_id_param: userId,
        action_param: "container.share.revoked",
        resource_type_param: "member_scope_permission",
        resource_id_param: grantId,
        user_agent_param: request.headers.get("user-agent"),
        metadata_param: {
          member_id: existing.member_id,
          permission_key: existing.permission_key,
          scope_type: existing.scope_type,
          market_id: existing.market_id,
          channel_id: existing.channel_id,
          collection_id: existing.collection_id,
        },
      });
    } catch (auditError) {
      console.warn("Failed to write container.share.revoked audit event:", auditError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in sharing scopes DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
