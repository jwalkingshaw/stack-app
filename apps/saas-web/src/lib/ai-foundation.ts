import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@stack-app/database";

export type AiTaskEnvelope = {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  taskType: string;
  provider: string | null;
  model: string | null;
  status: "pending" | "approved" | "rejected" | "completed" | "failed";
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  outputProfileId: string | null;
  partnerOrganizationId: string | null;
  productIds: string[];
  referencedAssetIds: string[];
  referencedDocumentIds: string[];
  allowedActions: string[];
  inputPayload: Record<string, unknown>;
  resultPayload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AiActionAuditRecord = {
  id: string;
  organizationId: string;
  aiTaskEnvelopeId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

export async function createAiTaskEnvelope(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  actorUserId?: string | null;
  taskType: string;
  provider?: string | null;
  model?: string | null;
  approvalRequired?: boolean;
  outputProfileId?: string | null;
  partnerOrganizationId?: string | null;
  productIds?: string[];
  referencedAssetIds?: string[];
  referencedDocumentIds?: string[];
  allowedActions?: string[];
  inputPayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase
    .from("ai_task_envelopes" as never)
    .insert(({
      organization_id: params.organizationId,
      actor_user_id: params.actorUserId ?? null,
      task_type: params.taskType,
      provider: params.provider ?? null,
      model: params.model ?? null,
      approval_required: params.approvalRequired !== false,
      output_profile_id: params.outputProfileId ?? null,
      partner_organization_id: params.partnerOrganizationId ?? null,
      product_ids: params.productIds ?? [],
      referenced_asset_ids: params.referencedAssetIds ?? [],
      referenced_document_ids: params.referencedDocumentIds ?? [],
      allowed_actions: params.allowedActions ?? [],
      input_payload: params.inputPayload ?? {},
      metadata: params.metadata ?? {},
    }) as never)
    .select("*")
    .single();

  if (error || !data) {
    throw error || new Error("Failed to create AI task envelope");
  }

  return normalizeAiTaskEnvelope(data as Record<string, unknown>);
}

export async function updateAiTaskEnvelopeResult(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  envelopeId: string;
  status: AiTaskEnvelope["status"];
  resultPayload?: Record<string, unknown>;
  approvedBy?: string | null;
  approvedAt?: string | null;
}) {
  const { data, error } = await params.supabase
    .from("ai_task_envelopes" as never)
    .update(({
      status: params.status,
      result_payload: params.resultPayload ?? {},
      approved_by: params.approvedBy ?? null,
      approved_at: params.approvedAt ?? null,
      updated_at: new Date().toISOString(),
    }) as never)
    .eq("organization_id", params.organizationId)
    .eq("id", params.envelopeId)
    .select("*")
    .single();

  if (error || !data) {
    throw error || new Error("Failed to update AI task envelope");
  }

  return normalizeAiTaskEnvelope(data as Record<string, unknown>);
}

export async function logAiActionAudit(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  aiTaskEnvelopeId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await params.supabase
    .from("ai_action_audit_logs" as never)
    .insert(({
      organization_id: params.organizationId,
      ai_task_envelope_id: params.aiTaskEnvelopeId ?? null,
      actor_user_id: params.actorUserId ?? null,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId ?? null,
      status: params.status ?? "recorded",
      metadata: params.metadata ?? {},
    }) as never)
    .select("*")
    .single();

  if (error || !data) {
    throw error || new Error("Failed to log AI action audit");
  }

  return normalizeAiActionAuditRecord(data as Record<string, unknown>);
}

export function normalizeAiTaskEnvelope(row: Record<string, unknown>): AiTaskEnvelope {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    taskType: String(row.task_type),
    provider: typeof row.provider === "string" ? row.provider : null,
    model: typeof row.model === "string" ? row.model : null,
    status: (typeof row.status === "string" ? row.status : "pending") as AiTaskEnvelope["status"],
    approvalRequired: row.approval_required !== false,
    approvedBy: typeof row.approved_by === "string" ? row.approved_by : null,
    approvedAt: typeof row.approved_at === "string" ? row.approved_at : null,
    outputProfileId: typeof row.output_profile_id === "string" ? row.output_profile_id : null,
    partnerOrganizationId:
      typeof row.partner_organization_id === "string" ? row.partner_organization_id : null,
    productIds: asStringArray(row.product_ids),
    referencedAssetIds: asStringArray(row.referenced_asset_ids),
    referencedDocumentIds: asStringArray(row.referenced_document_ids),
    allowedActions: asStringArray(row.allowed_actions),
    inputPayload: asObject(row.input_payload),
    resultPayload: asObject(row.result_payload),
    metadata: asObject(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getAiTaskEnvelope(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  envelopeId: string;
}): Promise<AiTaskEnvelope | null> {
  const { data, error } = await params.supabase
    .from("ai_task_envelopes" as never)
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("id", params.envelopeId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) return null;

  return normalizeAiTaskEnvelope(data as Record<string, unknown>);
}

export function normalizeAiActionAuditRecord(row: Record<string, unknown>): AiActionAuditRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    aiTaskEnvelopeId:
      typeof row.ai_task_envelope_id === "string" ? row.ai_task_envelope_id : null,
    actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    action: String(row.action),
    resourceType: String(row.resource_type),
    resourceId: typeof row.resource_id === "string" ? row.resource_id : null,
    status: typeof row.status === "string" ? row.status : "recorded",
    metadata: asObject(row.metadata),
    createdAt: String(row.created_at),
  };
}
