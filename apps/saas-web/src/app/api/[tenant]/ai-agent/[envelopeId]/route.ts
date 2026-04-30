import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess } from "@/lib/user-context";
import { getSupabaseServer } from "@/lib/supabase";
import { getAiTaskEnvelope } from "@/lib/ai-foundation";

// ---------------------------------------------------------------------------
// GET /api/[tenant]/ai-agent/[envelopeId]
// Poll the status and staged changes of an agent task.
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; envelopeId: string }> }
) {
  const { tenant, envelopeId } = await params;

  // Auth
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

  // Fetch envelope — org_id is always in the query so cross-org leakage is impossible
  const envelope = await getAiTaskEnvelope({
    supabase: getSupabaseServer(),
    organizationId,
    envelopeId,
  });

  if (!envelope) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: envelope.id,
    status: envelope.status,
    taskType: envelope.taskType,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    stagedChanges: (envelope.resultPayload?.staged_changes as unknown[]) ?? [],
    summary: (envelope.resultPayload?.summary as string) ?? "",
    clarificationNeeded: (envelope.resultPayload?.clarification_needed as string[] | null) ?? null,
    inputTokens: envelope.resultPayload?.input_tokens ?? 0,
    outputTokens: envelope.resultPayload?.output_tokens ?? 0,
  });
}
