type SecurityEventPayload = {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
};

type SecurityAuditClient = {
  rpc: unknown;
};

type RpcInvoker = (
  fn: string,
  params?: Record<string, unknown>
) => PromiseLike<unknown> | unknown;

function invokeRpc(
  client: SecurityAuditClient,
  fn: string,
  params: Record<string, unknown>
) {
  if (typeof client.rpc !== "function") {
    throw new Error("Security audit client does not expose rpc()");
  }
  const rpc = client.rpc as RpcInvoker;
  return rpc(fn, params);
}

export async function logSecurityEvent(
  supabaseClient: SecurityAuditClient,
  payload: SecurityEventPayload
): Promise<void> {
  try {
    await invokeRpc(supabaseClient, "log_security_event", {
      organization_id_param: payload.organizationId ?? null,
      actor_user_id_param: payload.actorUserId ?? null,
      action_param: payload.action,
      resource_type_param: payload.resourceType,
      resource_id_param: payload.resourceId ?? null,
      ip_address_param: payload.ipAddress ?? null,
      user_agent_param: payload.userAgent ?? null,
      metadata_param: payload.metadata ?? {},
    });
  } catch (error) {
    console.warn("[security-audit] Failed to write security event", {
      action: payload.action,
      error,
    });
  }
}

export async function logRateLimitSecurityEvent(
  supabaseClient: SecurityAuditClient,
  params: {
    action: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    actorUserId?: string | null;
    organizationId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await logSecurityEvent(supabaseClient, {
    organizationId: params.organizationId ?? null,
    actorUserId: params.actorUserId ?? null,
    action: "security.rate_limit_exceeded",
    resourceType: "rate_limit",
    userAgent: params.userAgent ?? null,
    ipAddress: params.ipAddress ?? null,
    metadata: {
      rate_limit_action: params.action,
      ...(params.metadata || {}),
    },
  });
}
