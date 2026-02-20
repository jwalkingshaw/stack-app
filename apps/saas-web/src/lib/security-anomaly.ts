export type SecurityAuditLogRow = {
  id: string;
  action: string;
  actor_user_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type SecurityAnomaly = {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  count: number;
};

export function analyzeSecurityAuditLogs(
  logs: SecurityAuditLogRow[],
  options?: {
    rateLimitAlertThreshold?: number;
    tokenAbuseThreshold?: number;
    permissionChangeThreshold?: number;
    authzP95ThresholdMs?: number;
  }
) {
  const rateLimitAlertThreshold = options?.rateLimitAlertThreshold ?? 25;
  const tokenAbuseThreshold = options?.tokenAbuseThreshold ?? 10;
  const permissionChangeThreshold = options?.permissionChangeThreshold ?? 20;
  const authzP95ThresholdMs = options?.authzP95ThresholdMs ?? 120;

  const byAction: Record<string, number> = {};
  const byIp: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  let rateLimitExceeded = 0;
  let tokenSensitiveRateLimitExceeded = 0;
  let permissionChangeEvents = 0;
  const authzDurations: number[] = [];

  for (const log of logs) {
    byAction[log.action] = (byAction[log.action] || 0) + 1;

    if (log.ip_address) {
      byIp[log.ip_address] = (byIp[log.ip_address] || 0) + 1;
    }
    if (log.actor_user_id) {
      byActor[log.actor_user_id] = (byActor[log.actor_user_id] || 0) + 1;
    }

    if (log.action === "security.rate_limit_exceeded") {
      rateLimitExceeded += 1;
      const rateAction = String(log.metadata?.rate_limit_action || "");
      if (
        rateAction === "invitation_accept" ||
        rateAction === "invitation_preview" ||
        rateAction === "partner_relationship_create" ||
        rateAction === "public_asset_download_token" ||
        rateAction === "tenant_asset_download_original" ||
        rateAction === "org_asset_download_original"
      ) {
        tokenSensitiveRateLimitExceeded += 1;
      }
    }

    if (
      log.action === "container.share.granted" ||
      log.action === "container.share.revoked" ||
      log.action === "member.role.assigned"
    ) {
      permissionChangeEvents += 1;
    }

    if (log.action === "authz.query.duration") {
      const duration = Number(log.metadata?.duration_ms);
      if (Number.isFinite(duration) && duration >= 0) {
        authzDurations.push(duration);
      }
    }
  }

  const computePercentile = (values: number[], percentile: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
    );
    return sorted[index] ?? 0;
  };
  const authzP95Ms = computePercentile(authzDurations, 95);

  const anomalies: SecurityAnomaly[] = [];
  if (rateLimitExceeded >= rateLimitAlertThreshold) {
    anomalies.push({
      type: "rate_limit_spike",
      severity: "high",
      message: `High volume of rate-limit violations detected (${rateLimitExceeded}).`,
      count: rateLimitExceeded,
    });
  }

  if (tokenSensitiveRateLimitExceeded >= tokenAbuseThreshold) {
    anomalies.push({
      type: "token_abuse_suspected",
      severity: "high",
      message: `Suspicious token endpoint pressure detected (${tokenSensitiveRateLimitExceeded}).`,
      count: tokenSensitiveRateLimitExceeded,
    });
  }

  if (permissionChangeEvents >= permissionChangeThreshold) {
    anomalies.push({
      type: "permission_change_spike",
      severity: "medium",
      message: `High rate of permission/scope changes detected (${permissionChangeEvents}).`,
      count: permissionChangeEvents,
    });
  }

  if (authzDurations.length >= 20 && authzP95Ms >= authzP95ThresholdMs) {
    anomalies.push({
      type: "authz_latency_degraded",
      severity: "medium",
      message: `Authorization query latency degraded (p95 ${authzP95Ms.toFixed(1)}ms).`,
      count: authzDurations.length,
    });
  }

  return {
    total: logs.length,
    rateLimitExceeded,
    tokenSensitiveRateLimitExceeded,
    permissionChangeEvents,
    authzQuerySamples: authzDurations.length,
    authzP95Ms,
    byAction,
    topIps: Object.entries(byIp)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count })),
    topActors: Object.entries(byActor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([actorUserId, count]) => ({ actorUserId, count })),
    anomalies,
  };
}
