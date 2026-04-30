import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAiActionAuditRecord,
  normalizeAiTaskEnvelope,
} from "./ai-foundation";

test("normalizeAiTaskEnvelope applies safe defaults", () => {
  const normalized = normalizeAiTaskEnvelope({
    id: "env-1",
    organization_id: "org-1",
    task_type: "build_export_payload",
    status: "pending",
    approval_required: true,
    product_ids: ["product-1"],
    referenced_asset_ids: null,
    referenced_document_ids: ["doc-1"],
    allowed_actions: ["suggest_output_content"],
    input_payload: { contractId: "contract-1" },
    result_payload: null,
    metadata: null,
    created_at: "2026-04-13T00:00:00.000Z",
    updated_at: "2026-04-13T00:00:00.000Z",
  });

  assert.equal(normalized.id, "env-1");
  assert.deepEqual(normalized.productIds, ["product-1"]);
  assert.deepEqual(normalized.referencedAssetIds, []);
  assert.deepEqual(normalized.allowedActions, ["suggest_output_content"]);
  assert.deepEqual(normalized.inputPayload, { contractId: "contract-1" });
  assert.deepEqual(normalized.resultPayload, {});
  assert.deepEqual(normalized.metadata, {});
});

test("normalizeAiActionAuditRecord coerces nullable ids", () => {
  const normalized = normalizeAiActionAuditRecord({
    id: "audit-1",
    organization_id: "org-1",
    ai_task_envelope_id: null,
    actor_user_id: null,
    action: "approve_export",
    resource_type: "output_profile",
    resource_id: null,
    status: "recorded",
    metadata: { provider: "claude" },
    created_at: "2026-04-13T00:00:00.000Z",
  });

  assert.equal(normalized.aiTaskEnvelopeId, null);
  assert.equal(normalized.actorUserId, null);
  assert.deepEqual(normalized.metadata, { provider: "claude" });
});
