import { supabaseServer } from "@/lib/supabase";

type PlanId = "free" | "starter" | "growth" | "scale" | "enterprise";

type LimitSet = {
  activeSkuCount: number;
  storageGb: number;
  deliveryBandwidthGb: number;
  internalUserCount: number;
  partnerInviteCount: number;
  deeplTotalCharCount: number;
};

type AddonId =
  | "sku_pack_3000"
  | "storage_pack_100gb"
  | "delivery_pack_500gb"
  | "seat_pack_5"
  | "partner_invite_pack_100";

type UsageSnapshot = {
  activeSkuCount: number;
  internalUserCount: number;
  partnerInviteCount: number;
  deeplTotalCharCount: number;
};

type MeterKey = keyof Pick<
  LimitSet,
  | "activeSkuCount"
  | "internalUserCount"
  | "partnerInviteCount"
  | "deeplTotalCharCount"
>;

const ACTIVE_SKU_STATUSES = new Set(["Draft", "Enrichment", "Review", "Active"]);
const BILLABLE_SKU_TYPES = new Set(["variant", "standalone"]);

const BASE_PLAN_LIMITS: Record<PlanId, LimitSet> = {
  free: {
    activeSkuCount: 10,
    storageGb: 2,
    deliveryBandwidthGb: 4,
    internalUserCount: 1,
    partnerInviteCount: 2,
    deeplTotalCharCount: 0,
  },
  starter: {
    activeSkuCount: 50,
    storageGb: 15,
    deliveryBandwidthGb: 25,
    internalUserCount: 2,
    partnerInviteCount: 10,
    deeplTotalCharCount: 750_000,
  },
  growth: {
    activeSkuCount: 500,
    storageGb: 100,
    deliveryBandwidthGb: 200,
    internalUserCount: 8,
    partnerInviteCount: 100,
    deeplTotalCharCount: 3_000_000,
  },
  scale: {
    activeSkuCount: 2500,
    storageGb: 500,
    deliveryBandwidthGb: 1000,
    internalUserCount: Number.MAX_SAFE_INTEGER,
    partnerInviteCount: Number.MAX_SAFE_INTEGER,
    deeplTotalCharCount: 12_000_000,
  },
  enterprise: {
    activeSkuCount: Number.MAX_SAFE_INTEGER,
    storageGb: Number.MAX_SAFE_INTEGER,
    deliveryBandwidthGb: Number.MAX_SAFE_INTEGER,
    internalUserCount: Number.MAX_SAFE_INTEGER,
    partnerInviteCount: Number.MAX_SAFE_INTEGER,
    deeplTotalCharCount: Number.MAX_SAFE_INTEGER,
  },
};

export const BILLING_PLAN_CATALOG: Array<{
  id: PlanId;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: "month";
  activeSkuLimit: number;
  storageLimitGb: number;
  deliveryBandwidthLimitGb: number;
  internalUserLimit: number;
  partnerInviteLimit: number;
  features: string[];
  popular?: boolean;
}> = [
  {
    id: "free",
    name: "Free (Sandbox)",
    description: "Ideal for product discovery",
    price: 0,
    currency: "USD",
    interval: "month",
    activeSkuLimit: 10,
    storageLimitGb: 2,
    deliveryBandwidthLimitGb: 4,
    internalUserLimit: 1,
    partnerInviteLimit: 2,
    features: [
      "10 active SKUs",
      "2GB storage",
      "4GB monthly delivery",
      "1 internal user",
      "2 external partner invites",
      "DeepL not included",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    description: "Ideal for single-brand founders",
    price: 49,
    currency: "USD",
    interval: "month",
    activeSkuLimit: 50,
    storageLimitGb: 15,
    deliveryBandwidthLimitGb: 25,
    internalUserLimit: 2,
    partnerInviteLimit: 10,
    features: [
      "50 active SKUs",
      "15GB storage",
      "25GB monthly delivery",
      "2 internal users",
      "10 external partner invites",
      "750,000 DeepL characters / month",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    description: "Ideal for established teams",
    price: 129,
    currency: "USD",
    interval: "month",
    activeSkuLimit: 500,
    storageLimitGb: 100,
    deliveryBandwidthLimitGb: 200,
    internalUserLimit: 8,
    partnerInviteLimit: 100,
    features: [
      "500 active SKUs",
      "100GB storage",
      "200GB monthly delivery",
      "8 internal users",
      "100 external partner invites",
      "3,000,000 DeepL characters / month",
    ],
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    description: "Ideal for global brands and retailers",
    price: 299,
    currency: "USD",
    interval: "month",
    activeSkuLimit: 2500,
    storageLimitGb: 500,
    deliveryBandwidthLimitGb: 1000,
    internalUserLimit: Number.MAX_SAFE_INTEGER,
    partnerInviteLimit: Number.MAX_SAFE_INTEGER,
    features: [
      "2,500 active SKUs",
      "500GB storage",
      "1,000GB monthly delivery",
      "Unlimited internal users",
      "Unlimited external partner invites",
      "12,000,000 DeepL characters / month",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Custom commercial and technical terms",
    price: 0,
    currency: "USD",
    interval: "month",
    activeSkuLimit: Number.MAX_SAFE_INTEGER,
    storageLimitGb: Number.MAX_SAFE_INTEGER,
    deliveryBandwidthLimitGb: Number.MAX_SAFE_INTEGER,
    internalUserLimit: Number.MAX_SAFE_INTEGER,
    partnerInviteLimit: Number.MAX_SAFE_INTEGER,
    features: ["Custom limits", "Custom support", "Custom controls"],
  },
];

const ADDON_DELTAS: Record<AddonId, Partial<LimitSet>> = {
  sku_pack_3000: { activeSkuCount: 3000 },
  storage_pack_100gb: { storageGb: 100 },
  delivery_pack_500gb: { deliveryBandwidthGb: 500 },
  seat_pack_5: { internalUserCount: 5 },
  partner_invite_pack_100: { partnerInviteCount: 100 },
};

const LEGACY_PLAN_MAPPING: Record<string, PlanId> = {
  free: "free",
  sandbox: "free",
  starter: "starter",
  growth: "growth",
  professional: "growth",
  scale: "scale",
  enterprise: "enterprise",
};

function isMissingSchemaError(error: any): boolean {
  return error?.code === "42P01" || error?.code === "42703";
}

function normalizePlanId(raw: string | null | undefined): PlanId {
  if (!raw) return "free";
  const key = String(raw).trim().toLowerCase();
  return LEGACY_PLAN_MAPPING[key] || "free";
}

function applyAddonDeltas(base: LimitSet, addons: Array<{ addonId: string; quantity: number }>): LimitSet {
  const next = { ...base };
  for (const addon of addons) {
    const normalizedAddonId = String(addon.addonId || "").trim().toLowerCase() as AddonId;
    const quantity = Number.isFinite(addon.quantity) ? Math.max(0, Math.floor(addon.quantity)) : 0;
    if (quantity <= 0) continue;
    const delta = ADDON_DELTAS[normalizedAddonId];
    if (!delta) continue;

    if (typeof delta.activeSkuCount === "number") {
      next.activeSkuCount += delta.activeSkuCount * quantity;
    }
    if (typeof delta.storageGb === "number") {
      next.storageGb += delta.storageGb * quantity;
    }
    if (typeof delta.deliveryBandwidthGb === "number") {
      next.deliveryBandwidthGb += delta.deliveryBandwidthGb * quantity;
    }
    if (typeof delta.internalUserCount === "number") {
      next.internalUserCount += delta.internalUserCount * quantity;
    }
    if (typeof delta.partnerInviteCount === "number") {
      next.partnerInviteCount += delta.partnerInviteCount * quantity;
    }
    if (typeof delta.deeplTotalCharCount === "number") {
      next.deeplTotalCharCount += delta.deeplTotalCharCount * quantity;
    }
  }
  return next;
}

async function resolvePlanIdForOrganization(organizationId: string): Promise<PlanId> {
  try {
    const { data, error } = await (supabaseServer as any)
      .from("organization_subscriptions")
      .select("plan_id,status,current_period_end")
      .eq("organization_id", organizationId)
      .in("status", ["trialing", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && !isMissingSchemaError(error)) {
      console.error("Failed to resolve organization subscription plan:", error);
    }
    if (data?.plan_id) {
      return normalizePlanId(data.plan_id);
    }
  } catch (error) {
    console.error("Failed to read organization_subscriptions:", error);
  }

  try {
    const { data, error } = await (supabaseServer as any)
      .from("organizations")
      .select("subscription_tier")
      .eq("id", organizationId)
      .maybeSingle();

    if (error && !isMissingSchemaError(error)) {
      console.error("Failed to resolve legacy plan tier:", error);
    }

    return normalizePlanId(data?.subscription_tier);
  } catch (error) {
    console.error("Failed to read organization.subscription_tier:", error);
    return "free";
  }
}

async function resolveActiveAddonsForOrganization(
  organizationId: string
): Promise<Array<{ addonId: string; quantity: number }>> {
  const now = new Date();
  try {
    const { data, error } = await (supabaseServer as any)
      .from("organization_subscription_addons")
      .select("addon_id,quantity,status,expires_at")
      .eq("organization_id", organizationId)
      .eq("status", "active");

    if (error) {
      if (!isMissingSchemaError(error)) {
        console.error("Failed to resolve active add-ons:", error);
      }
      return [];
    }

    return ((data || []) as Array<any>)
      .filter((row) => {
        if (!row.expires_at) return true;
        const expiresAt = new Date(row.expires_at);
        return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
      })
      .map((row) => ({
        addonId: String(row.addon_id || ""),
        quantity: Number(row.quantity || 1),
      }));
  } catch (error) {
    console.error("Failed to read organization_subscription_addons:", error);
    return [];
  }
}

async function countActiveSkus(organizationId: string): Promise<number> {
  const { count, error } = await (supabaseServer as any)
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("type", Array.from(BILLABLE_SKU_TYPES))
    .in("status", Array.from(ACTIVE_SKU_STATUSES));

  if (error) {
    console.error("Failed to count active SKUs:", error);
    return 0;
  }
  return count || 0;
}

async function countInternalUsers(organizationId: string): Promise<number> {
  const { count, error } = await (supabaseServer as any)
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (error) {
    console.error("Failed to count internal users:", error);
    return 0;
  }
  return count || 0;
}

async function countExternalPartnerInviteUsage(organizationId: string): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();
  const identityKeys = new Set<string>();

  const baseQuery = (supabaseServer as any)
    .from("invitations")
    .select("email,accepted_at,declined_at,revoked_at,expires_at,partner_organization_id")
    .eq("organization_id", organizationId)
    .eq("invitation_type", "partner");

  let invitationsResult = await baseQuery;
  if (invitationsResult.error?.code === "42703") {
    invitationsResult = await (supabaseServer as any)
      .from("invitations")
      .select("email,accepted_at,declined_at,expires_at,partner_organization_id")
      .eq("organization_id", organizationId)
      .eq("invitation_type", "partner");
  }

  if (invitationsResult.error) {
    console.error("Failed to count external partner invite usage:", invitationsResult.error);
    return 0;
  }

  for (const row of (invitationsResult.data || []) as Array<any>) {
    const acceptedAt = row.accepted_at ? new Date(row.accepted_at) : null;
    const declinedAt = row.declined_at ? new Date(row.declined_at) : null;
    const revokedAt = row.revoked_at ? new Date(row.revoked_at) : null;
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;

    const isAccepted = Boolean(acceptedAt);
    const isPending =
      !acceptedAt &&
      !declinedAt &&
      !revokedAt &&
      (!expiresAt || expiresAt.getTime() > now.getTime());

    if (!isAccepted && !isPending) {
      continue;
    }

    if (row.partner_organization_id) {
      identityKeys.add(`org:${String(row.partner_organization_id)}`);
      continue;
    }

    const email = String(row.email || "").trim().toLowerCase();
    if (!email) continue;
    identityKeys.add(`email:${email}`);
  }

  const relationshipAttempts: Array<{ brandColumn: string; partnerColumn: string }> = [
    { brandColumn: "brand_organization_id", partnerColumn: "partner_organization_id" },
    { brandColumn: "brand_id", partnerColumn: "partner_id" },
  ];

  for (const attempt of relationshipAttempts) {
    const relationshipsResult = await (supabaseServer as any)
      .from("brand_partner_relationships")
      .select(attempt.partnerColumn)
      .eq(attempt.brandColumn, organizationId)
      .eq("status", "active");

    if (!relationshipsResult.error) {
      for (const row of (relationshipsResult.data || []) as Array<any>) {
        const partnerId = row[attempt.partnerColumn];
        if (!partnerId) continue;
        identityKeys.add(`org:${String(partnerId)}`);
      }
      break;
    }

    if (!isMissingSchemaError(relationshipsResult.error)) {
      console.error("Failed to count brand-partner relationships:", relationshipsResult.error);
      break;
    }
  }

  return identityKeys.size;
}

async function countMonthlyLocalizationUsage(params: {
  organizationId: string;
  meter: "translation_chars" | "write_chars";
}): Promise<number> {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  const { data, error } = await (supabaseServer as any)
    .from("organization_usage_monthly_snapshots")
    .select(params.meter)
    .eq("organization_id", params.organizationId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error) {
    if (!isMissingSchemaError(error)) {
      console.error(`Failed to count ${params.meter}:`, error);
    }
    return 0;
  }

  const raw = data?.[params.meter];
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Number(raw));
}

export function isActiveSkuStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return ACTIVE_SKU_STATUSES.has(String(status));
}

export function isBillableSkuType(type: string | null | undefined): boolean {
  if (!type) return false;
  return BILLABLE_SKU_TYPES.has(String(type));
}

export function isBillableSkuRecord(params: {
  type: string | null | undefined;
  status: string | null | undefined;
}): boolean {
  return isBillableSkuType(params.type) && isActiveSkuStatus(params.status);
}

export async function getOrganizationBillingLimits(organizationId: string): Promise<{
  planId: PlanId;
  limits: LimitSet;
}> {
  const planId = await resolvePlanIdForOrganization(organizationId);
  const base = BASE_PLAN_LIMITS[planId] || BASE_PLAN_LIMITS.free;
  const addons = await resolveActiveAddonsForOrganization(organizationId);
  const limits = applyAddonDeltas(base, addons);
  return { planId, limits };
}

export async function getOrganizationUsageSnapshot(
  organizationId: string
): Promise<UsageSnapshot> {
  const [
    activeSkuCount,
    internalUserCount,
    partnerInviteCount,
    translationCharCount,
    writeCharCount,
  ] = await Promise.all([
    countActiveSkus(organizationId),
    countInternalUsers(organizationId),
    countExternalPartnerInviteUsage(organizationId),
    countMonthlyLocalizationUsage({
      organizationId,
      meter: "translation_chars",
    }),
    countMonthlyLocalizationUsage({
      organizationId,
      meter: "write_chars",
    }),
  ]);

  return {
    activeSkuCount,
    internalUserCount,
    partnerInviteCount,
    deeplTotalCharCount: translationCharCount + writeCharCount,
  };
}

const METER_LABELS: Record<MeterKey, string> = {
  activeSkuCount: "active SKU limit",
  internalUserCount: "internal user limit",
  partnerInviteCount: "partner invite limit",
  deeplTotalCharCount: "DeepL character limit",
};

export async function assertBillingCapacity(params: {
  organizationId: string;
  meter: MeterKey;
  incrementBy?: number;
}): Promise<{
  allowed: boolean;
  limit: number;
  usage: number;
  projected: number;
  message?: string;
}> {
  const incrementBy = Number.isFinite(params.incrementBy) ? Math.max(1, Math.floor(params.incrementBy!)) : 1;
  const [{ limits }, usage] = await Promise.all([
    getOrganizationBillingLimits(params.organizationId),
    getOrganizationUsageSnapshot(params.organizationId),
  ]);

  const limit = limits[params.meter];
  const currentUsage = usage[params.meter];
  const projected = currentUsage + incrementBy;

  if (limit >= Number.MAX_SAFE_INTEGER) {
    return { allowed: true, limit, usage: currentUsage, projected };
  }

  if (projected <= limit) {
    return { allowed: true, limit, usage: currentUsage, projected };
  }

  return {
    allowed: false,
    limit,
    usage: currentUsage,
    projected,
    message: `You have reached your ${METER_LABELS[params.meter]} (${currentUsage}/${limit}). Upgrade your plan or purchase an add-on to continue.`,
  };
}
