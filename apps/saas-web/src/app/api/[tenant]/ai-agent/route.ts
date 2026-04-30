import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess } from "@/lib/user-context";
import { getSupabaseServer } from "@/lib/supabase";
import { normalizeAiTaskEnvelope } from "@/lib/ai-foundation";

// ---------------------------------------------------------------------------
// GET /api/[tenant]/ai-agent
// Returns paginated agent task history for the organisation.
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params;

  const { getUser } = getKindeServerSession();
  const user = await getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await hasOrganizationAccess(tenant, "collaborate");
  if (!access.hasAccess || !access.organizationId) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const organizationId = access.organizationId;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);

  const { data, error } = await getSupabaseServer()
    .from("ai_task_envelopes")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("task_type", "agent_task")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch agent history:", error);
    return NextResponse.json({ error: "Failed to load history." }, { status: 500 });
  }

  const envelopes = ((data as unknown[]) ?? []).map((row) => {
    const env = normalizeAiTaskEnvelope(row as Record<string, unknown>);
    const stagedChanges = (env.resultPayload?.staged_changes as Array<{ approved: boolean | null }>) ?? [];
    return {
      id: env.id,
      status: env.status,
      taskType: env.taskType,
      summary: (env.resultPayload?.summary as string) ?? "",
      stagedChanges,
      createdAt: env.createdAt,
    };
  });

  return NextResponse.json(envelopes);
}
