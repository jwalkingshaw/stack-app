import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess } from "@/lib/user-context";
import { getSupabaseServer } from "@/lib/supabase";
import {
  getAiTaskEnvelope,
  updateAiTaskEnvelopeResult,
  logAiActionAudit,
} from "@/lib/ai-foundation";

// ---------------------------------------------------------------------------
// POST /api/[tenant]/ai-agent/[envelopeId]/reject
//
// Rejects all pending staged changes — no database writes are made.
// ---------------------------------------------------------------------------

export async function POST(
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
  const actorUserId = user.id;

  // Load envelope
  const envelope = await getAiTaskEnvelope({
    supabase: getSupabaseServer(),
    organizationId,
    envelopeId,
  });
  if (!envelope) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (envelope.status !== "pending") {
    return NextResponse.json(
      { error: `Cannot reject a task with status '${envelope.status}'.` },
      { status: 409 }
    );
  }

  // Mark all pending changes as rejected (no DB writes)
  const stagedChanges = (envelope.resultPayload?.staged_changes ?? []) as Array<
    Record<string, unknown>
  >;
  const updated = stagedChanges.map((c) =>
    c.approved === null ? { ...c, approved: false } : c
  );

  await updateAiTaskEnvelopeResult({
    supabase: getSupabaseServer(),
    organizationId,
    envelopeId: envelope.id,
    status: "rejected",
    resultPayload: {
      ...envelope.resultPayload,
      staged_changes: updated,
    },
  });

  await logAiActionAudit({
    supabase: getSupabaseServer(),
    organizationId,
    aiTaskEnvelopeId: envelope.id,
    actorUserId,
    action: "rejected_all",
    resourceType: "ai_task_envelope",
    resourceId: envelope.id,
    status: "recorded",
    metadata: { rejected_count: updated.filter((c) => c.approved === false).length },
  });

  return NextResponse.json({ status: "rejected", message: "No changes were made." });
}
