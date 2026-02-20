import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSecurityAuditLogs } from "./security-anomaly";

test("detects rate limit and token abuse anomalies", () => {
  const logs = Array.from({ length: 30 }).map((_, i) => ({
    id: `log_${i}`,
    action: "security.rate_limit_exceeded",
    actor_user_id: i % 2 === 0 ? "user_1" : null,
    ip_address: i % 3 === 0 ? "10.0.0.1" : "10.0.0.2",
    metadata: {
      rate_limit_action: i < 12 ? "invitation_accept" : "team_invite_create",
    },
    created_at: new Date().toISOString(),
  }));

  const result = analyzeSecurityAuditLogs(logs, {
    rateLimitAlertThreshold: 20,
    tokenAbuseThreshold: 10,
  });

  assert.equal(result.rateLimitExceeded, 30);
  assert.equal(result.tokenSensitiveRateLimitExceeded, 12);
  assert.equal(result.anomalies.length, 2);
  assert.equal(result.anomalies[0]?.type, "rate_limit_spike");
  assert.equal(result.anomalies[1]?.type, "token_abuse_suspected");
});

test("returns no anomalies when activity is below thresholds", () => {
  const logs = [
    {
      id: "a1",
      action: "invite.created",
      actor_user_id: "user_1",
      ip_address: "10.0.0.3",
      metadata: {},
      created_at: new Date().toISOString(),
    },
    {
      id: "a2",
      action: "security.rate_limit_exceeded",
      actor_user_id: null,
      ip_address: "10.0.0.3",
      metadata: { rate_limit_action: "team_invite_create" },
      created_at: new Date().toISOString(),
    },
  ];

  const result = analyzeSecurityAuditLogs(logs, {
    rateLimitAlertThreshold: 5,
    tokenAbuseThreshold: 5,
  });

  assert.equal(result.anomalies.length, 0);
  assert.equal(result.topIps.length, 1);
  assert.equal(result.topIps[0]?.ip, "10.0.0.3");
});

test("detects permission change spike anomaly", () => {
  const logs = Array.from({ length: 15 }).map((_, i) => ({
    id: `perm_${i}`,
    action: i % 2 === 0 ? "container.share.granted" : "container.share.revoked",
    actor_user_id: "admin_1",
    ip_address: "10.0.0.10",
    metadata: {},
    created_at: new Date().toISOString(),
  }));

  const result = analyzeSecurityAuditLogs(logs, {
    permissionChangeThreshold: 10,
  });

  assert.equal(result.permissionChangeEvents, 15);
  const anomaly = result.anomalies.find((item) => item.type === "permission_change_spike");
  assert.ok(anomaly);
  assert.equal(anomaly?.severity, "medium");
});

test("detects degraded authz latency when p95 exceeds threshold", () => {
  const logs = Array.from({ length: 30 }).map((_, i) => ({
    id: `authz_${i}`,
    action: "authz.query.duration",
    actor_user_id: "user_1",
    ip_address: "10.0.0.20",
    metadata: {
      duration_ms: i < 20 ? 30 : 180,
    },
    created_at: new Date().toISOString(),
  }));

  const result = analyzeSecurityAuditLogs(logs, {
    authzP95ThresholdMs: 100,
  });

  assert.equal(result.authzQuerySamples, 30);
  assert.ok(result.authzP95Ms >= 100);
  const anomaly = result.anomalies.find((item) => item.type === "authz_latency_degraded");
  assert.ok(anomaly);
});
