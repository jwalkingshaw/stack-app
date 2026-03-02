import { createHash } from "crypto";
import * as jwksClient from "jwks-rsa";
import * as jwt from "jsonwebtoken";

type KindeWebhookPayload = Record<string, unknown>;

export type VerifiedKindeWebhookEvent = {
  eventId: string;
  eventType: string;
  issuedAt?: string | null;
  createdOn?: string | null;
  payload: KindeWebhookPayload;
};

export type KindeBillingRefs = {
  organizationId?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  planId?: "free" | "starter" | "growth" | "scale" | "enterprise";
  status?:
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "incomplete_expired";
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialStart?: string;
  trialEnd?: string;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string;
};

let cachedJwksClient: any = null;
let cachedPlanMapping: Record<string, "free" | "starter" | "growth" | "scale" | "enterprise"> | null = null;

function getKindeIssuerUrl(): string | null {
  const raw = process.env.KINDE_ISSUER_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function getJwksClient(): any {
  if (cachedJwksClient) return cachedJwksClient;

  const issuer = getKindeIssuerUrl();
  if (!issuer) {
    throw new Error("Missing KINDE_ISSUER_URL");
  }

  cachedJwksClient = jwksClient.default({
    jwksUri: `${issuer}/.well-known/jwks.json`,
    cache: true,
    cacheMaxAge: 86400000,
    cacheMaxEntries: 5,
    jwksRequestsPerMinute: 10,
  });

  return cachedJwksClient;
}

function asObject(value: unknown): KindeWebhookPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as KindeWebhookPayload;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getAtPath(obj: Record<string, any>, path: string[]): unknown {
  let cursor: any = obj;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function firstString(obj: Record<string, any>, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = getAtPath(obj, path);
    const normalized = asString(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function firstBoolean(obj: Record<string, any>, paths: string[][]): boolean | undefined {
  for (const path of paths) {
    const value = getAtPath(obj, path);
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
  }
  return undefined;
}

function getConfiguredPlanMapping(): Record<
  string,
  "free" | "starter" | "growth" | "scale" | "enterprise"
> {
  if (cachedPlanMapping) {
    return cachedPlanMapping;
  }

  const mapping: Record<string, "free" | "starter" | "growth" | "scale" | "enterprise"> = {};
  const raw = String(process.env.KINDE_BILLING_PLAN_MAP || "").trim();
  if (!raw) {
    cachedPlanMapping = mapping;
    return mapping;
  }

  // Example: "sandbox-plan:free,starter-v1:starter,growth-v1:growth,scale-v1:scale"
  for (const entry of raw.split(",")) {
    const [sourceRaw, targetRaw] = entry.split(":").map((part) => String(part || "").trim().toLowerCase());
    if (!sourceRaw || !targetRaw) continue;
    if (
      targetRaw === "free" ||
      targetRaw === "starter" ||
      targetRaw === "growth" ||
      targetRaw === "scale" ||
      targetRaw === "enterprise"
    ) {
      mapping[sourceRaw] = targetRaw;
    }
  }

  cachedPlanMapping = mapping;
  return mapping;
}

function normalizeIncomingPlanId(raw: string | undefined): "free" | "starter" | "growth" | "scale" | "enterprise" | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  const configuredMapping = getConfiguredPlanMapping();
  if (configuredMapping[key]) return configuredMapping[key];
  if (key.includes("free") || key.includes("sandbox")) return "free";
  if (key.includes("starter")) return "starter";
  if (key.includes("growth") || key.includes("professional")) return "growth";
  if (key.includes("scale")) return "scale";
  if (key.includes("enterprise")) return "enterprise";
  return undefined;
}

function normalizeIncomingStatus(
  raw: string | undefined
):
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  if (key === "trialing" || key === "trial") return "trialing";
  if (key === "active") return "active";
  if (key === "past_due" || key === "pastdue") return "past_due";
  if (key === "canceled" || key === "cancelled") return "canceled";
  if (key === "incomplete") return "incomplete";
  if (key === "incomplete_expired" || key === "incompleteexpired") return "incomplete_expired";
  return undefined;
}

export async function verifyKindeWebhookJwt(
  token: string
): Promise<{ ok: true; event: VerifiedKindeWebhookEvent } | { ok: false; error: string }> {
  const raw = token?.trim();
  if (!raw) {
    return { ok: false, error: "Webhook body was empty" };
  }

  const issuer = getKindeIssuerUrl();
  if (!issuer) {
    return { ok: false, error: "KINDE_ISSUER_URL is not configured" };
  }

  try {
    const decodedHeader = jwt.decode(raw, { complete: true }) as any;
    const kid = asString(decodedHeader?.header?.kid);
    if (!kid) {
      return { ok: false, error: "Webhook JWT is missing key id (kid)" };
    }

    const client = getJwksClient();
    const signingKey = await client.getSigningKey(kid);
    const publicKey = signingKey.getPublicKey();

    const verified = jwt.verify(raw, publicKey, {
      algorithms: ["RS256"],
      issuer,
    }) as Record<string, unknown>;

    const payload = asObject(verified);
    const hashedEventId = createHash("sha256").update(raw).digest("hex");
    const eventId =
      asString(payload.event_id) ||
      asString(payload.id) ||
      asString(payload.jti) ||
      hashedEventId;
    const eventType =
      asString(payload.type) ||
      asString(payload.event_type) ||
      "unknown";

    return {
      ok: true,
      event: {
        eventId,
        eventType,
        issuedAt: asString(payload.iat) || null,
        createdOn: asString(payload.created_on) || asString(payload.created_at) || null,
        payload,
      },
    };
  } catch (error) {
    console.error("Failed to verify Kinde billing webhook JWT:", error);
    return { ok: false, error: "JWT verification failed" };
  }
}

export function extractKindeBillingRefs(event: VerifiedKindeWebhookEvent): KindeBillingRefs {
  const payload = asObject(event.payload);
  const data = asObject(payload.data);

  const organizationId =
    firstString(data, [["organization_id"], ["organizationId"], ["organization", "id"]]) ||
    firstString(payload as Record<string, any>, [["organization_id"], ["organizationId"], ["organization", "id"]]);

  const providerCustomerId =
    firstString(data, [
      ["customer_id"],
      ["customerId"],
      ["customer", "id"],
      ["agreement", "customer_id"],
      ["agreement", "customer", "id"],
    ]) ||
    firstString(payload as Record<string, any>, [["customer_id"], ["customerId"], ["customer", "id"]]);

  const providerSubscriptionId =
    firstString(data, [
      ["subscription_id"],
      ["subscriptionId"],
      ["agreement_id"],
      ["agreement", "id"],
      ["subscription", "id"],
    ]) ||
    firstString(payload as Record<string, any>, [["subscription_id"], ["agreement_id"], ["agreement", "id"]]);

  const planId = normalizeIncomingPlanId(
    firstString(data, [["plan_id"], ["planId"], ["plan", "id"], ["plan", "key"]]) ||
      firstString(payload as Record<string, any>, [["plan_id"], ["planId"], ["plan", "id"], ["plan", "key"]])
  );

  const status = normalizeIncomingStatus(
    firstString(data, [["status"], ["subscription", "status"], ["agreement", "status"]]) ||
      firstString(payload as Record<string, any>, [["status"], ["agreement", "status"]])
  );

  const currentPeriodStart = firstString(data, [
    ["current_period_start"],
    ["currentPeriodStart"],
    ["period", "start"],
  ]);

  const currentPeriodEnd = firstString(data, [
    ["current_period_end"],
    ["currentPeriodEnd"],
    ["period", "end"],
  ]);

  const trialStart = firstString(data, [["trial_start"], ["trialStart"]]);
  const trialEnd = firstString(data, [["trial_end"], ["trialEnd"]]);
  const canceledAt = firstString(data, [["canceled_at"], ["cancelled_at"], ["canceledAt"], ["cancelledAt"]]);
  const cancelAtPeriodEnd = firstBoolean(data, [["cancel_at_period_end"], ["cancelAtPeriodEnd"]]);

  return {
    organizationId,
    providerCustomerId,
    providerSubscriptionId,
    planId,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    trialStart,
    trialEnd,
    canceledAt,
    cancelAtPeriodEnd,
  };
}
