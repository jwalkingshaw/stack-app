import { Resend } from "resend";
import type { Database, Json } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { normalizeUuidArray } from "./_shared";
import {
  resolvePartnerGrantedAssetIds,
  resolvePartnerGrantedProductIds,
} from "@/lib/partner-brand-view";

const supabase = supabaseServer;

export type DeliveryChannel = "in_app" | "email" | "sms";

const VALID_DELIVERY_CHANNELS = new Set<DeliveryChannel>(["in_app", "email", "sms"]);
const PARTNER_NOTIFICATION_RECIPIENT_STATUSES = new Set([
  "queued",
  "notified",
  "failed",
]);

type RecipientSelection = {
  partnerOrganizationIds: string[];
  shareSetIds: string[];
  marketIds: string[];
  channelIds: string[];
  localeIds: string[];
};

type RecipientResolutionResult =
  | { ok: true; partnerOrganizationIds: string[] }
  | { ok: false; status: number; error: string };

type RecipientKitAccessCheckResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      error: string;
      blockedRecipients: Array<{
        partnerOrganizationId: string;
        missingProductIds: string[];
        missingAssetIds: string[];
      }>;
    };

type ConsentStatus = "opted_in" | "opted_out" | null;
type ChannelConsentDecision = {
  allowed: boolean;
  reason: string;
};

type PartnerConsentDecision = {
  email: ChannelConsentDecision;
  sms: ChannelConsentDecision;
};

type RecipientDispatchDecision = {
  partnerOrganizationId: string;
  deliveryChannels: DeliveryChannel[];
  consent: PartnerConsentDecision;
};

type EmailTarget = {
  partnerOrganizationId: string;
  emails: string[];
};

type PartnerUpdateRecord = {
  id: string;
  title: string;
  summary: string | null;
  urgency: string;
  status: string;
  due_at: string | null;
  scheduled_for: string | null;
  published_at: string | null;
};

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error?.code === "42703") return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column");
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error?.code === "42P01" || error?.code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}

function sanitizeEmails(values: string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) continue;
    out.add(normalized);
  }
  return Array.from(out);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (!normalized) continue;
    out.add(normalized);
  }
  return Array.from(out);
}

function normalizeRelationshipScopeIds(
  settings: Record<string, unknown> | null | undefined,
  keys: string[]
): string[] {
  if (!settings || typeof settings !== "object") return [];
  for (const key of keys) {
    const raw = settings[key];
    const normalized = normalizeUuidArray(raw);
    if (normalized.length > 0) return normalized;
    const generic = normalizeStringArray(raw);
    if (generic.length > 0) return generic;
  }
  return [];
}

function hasScopeOverlap(
  targetScopeIds: string[],
  relationshipScopeIds: string[]
): boolean {
  if (targetScopeIds.length === 0) return true;
  if (relationshipScopeIds.length === 0) return true;
  const relationshipSet = new Set(relationshipScopeIds);
  return targetScopeIds.some((id) => relationshipSet.has(id));
}

export function normalizeRecipientSelection(input: unknown): RecipientSelection {
  const payload = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    partnerOrganizationIds: normalizeUuidArray(
      payload.partnerOrganizationIds || payload.partner_organization_ids
    ),
    shareSetIds: normalizeUuidArray(payload.shareSetIds || payload.share_set_ids),
    marketIds: normalizeUuidArray(payload.marketIds || payload.market_ids),
    channelIds: normalizeUuidArray(payload.channelIds || payload.channel_ids),
    localeIds: normalizeUuidArray(payload.localeIds || payload.locale_ids),
  };
}

export function normalizeDeliveryChannels(input: unknown): DeliveryChannel[] {
  const values = Array.isArray(input) ? input : [];
  const channels = new Set<DeliveryChannel>();

  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const normalized = raw.trim().toLowerCase() as DeliveryChannel;
    if (!VALID_DELIVERY_CHANNELS.has(normalized)) continue;
    channels.add(normalized);
  }

  // In-app notifications are required for all updates.
  channels.add("in_app");
  return Array.from(channels);
}

async function resolveActiveBrandPartnerRows(params: {
  organizationId: string;
}): Promise<
  | {
      ok: true;
      rows: Array<{
        partnerOrganizationId: string;
        settings: Record<string, unknown>;
      }>;
    }
  | { ok: false; status: number; error: string }
> {
  const { organizationId } = params;

  const v2 = await supabase
    .from("brand_partner_relationships")
    .select("partner_organization_id,settings")
    .eq("brand_organization_id", organizationId)
    .eq("status", "active");

  if (!v2.error) {
    return {
      ok: true,
      rows: ((v2.data || []) as Array<{
        partner_organization_id: string | null;
        settings: Record<string, unknown> | null;
      }>)
        .filter((row) => Boolean(row.partner_organization_id))
        .map((row) => ({
          partnerOrganizationId: String(row.partner_organization_id),
          settings:
            row.settings && typeof row.settings === "object" && !Array.isArray(row.settings)
              ? row.settings
              : {},
        })),
    };
  }

  if (!isMissingColumnError(v2.error)) {
    return {
      ok: false,
      status: 500,
      error: "Failed to resolve active partner relationships",
    };
  }

  return {
    ok: false,
    status: 500,
    error: "Failed to resolve active partner relationships",
  };
}

async function filterPartnersByShareSetGrants(params: {
  organizationId: string;
  partnerOrganizationIds: string[];
  shareSetIds: string[];
}): Promise<RecipientResolutionResult> {
  const { organizationId, partnerOrganizationIds, shareSetIds } = params;
  if (shareSetIds.length === 0 || partnerOrganizationIds.length === 0) {
    return { ok: true, partnerOrganizationIds };
  }

  const { data: sets, error: setsError } = await supabase
    .from("share_sets")
    .select("id")
    .eq("organization_id", organizationId)
    .in("id", shareSetIds);

  if (setsError) {
    if (isMissingTableError(setsError)) {
      return {
        ok: false,
        status: 503,
        error: "Share set tables are unavailable. Apply share set migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to validate selected share sets" };
  }

  const validSetIds = new Set(
    ((sets || []) as Array<{ id: string | null }>)
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id))
  );
  if (validSetIds.size !== shareSetIds.length) {
    return {
      ok: false,
      status: 400,
      error: "One or more selected shareSetIds are invalid for this workspace",
    };
  }

  const { data: grants, error: grantsError } = await supabase
    .from("partner_share_set_grants")
    .select("partner_organization_id,expires_at")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("share_set_id", shareSetIds)
    .in("partner_organization_id", partnerOrganizationIds);

  if (grantsError) {
    if (isMissingTableError(grantsError)) {
      return {
        ok: false,
        status: 503,
        error: "Share set grant table is unavailable. Apply share set migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to resolve partner share set grants" };
  }

  const nowMs = Date.now();
  const grantedPartnerIds = new Set<string>();
  for (const row of (grants || []) as Array<{
    partner_organization_id: string | null;
    expires_at: string | null;
  }>) {
    if (!row.partner_organization_id) continue;
    if (row.expires_at) {
      const expiresMs = Date.parse(row.expires_at);
      if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
        continue;
      }
    }
    grantedPartnerIds.add(String(row.partner_organization_id));
  }

  return {
    ok: true,
    partnerOrganizationIds: partnerOrganizationIds.filter((id) => grantedPartnerIds.has(id)),
  };
}

export async function resolveRecipientOrganizations(params: {
  organizationId: string;
  recipientSelection: RecipientSelection;
}): Promise<RecipientResolutionResult> {
  const activePartners = await resolveActiveBrandPartnerRows({
    organizationId: params.organizationId,
  });
  if (!activePartners.ok) return activePartners;

  const explicitPartnerIds = new Set(params.recipientSelection.partnerOrganizationIds);
  const filteredForExplicitSelection = activePartners.rows.filter((row) => {
    if (explicitPartnerIds.size === 0) return true;
    return explicitPartnerIds.has(row.partnerOrganizationId);
  });

  const filteredForRelationshipScope = filteredForExplicitSelection.filter((row) => {
    const marketIds = normalizeRelationshipScopeIds(row.settings, ["market_ids", "marketIds"]);
    const channelIds = normalizeRelationshipScopeIds(row.settings, [
      "channel_ids",
      "channelIds",
    ]);
    const localeIds = normalizeRelationshipScopeIds(row.settings, ["locale_ids", "localeIds"]);

    return (
      hasScopeOverlap(params.recipientSelection.marketIds, marketIds) &&
      hasScopeOverlap(params.recipientSelection.channelIds, channelIds) &&
      hasScopeOverlap(params.recipientSelection.localeIds, localeIds)
    );
  });

  const byShareSet = await filterPartnersByShareSetGrants({
    organizationId: params.organizationId,
    partnerOrganizationIds: Array.from(
      new Set(filteredForRelationshipScope.map((row) => row.partnerOrganizationId))
    ),
    shareSetIds: params.recipientSelection.shareSetIds,
  });
  if (!byShareSet.ok) return byShareSet;

  return {
    ok: true,
    partnerOrganizationIds: byShareSet.partnerOrganizationIds,
  };
}

async function loadUpdateKitResourceIds(params: {
  organizationId: string;
  updateId: string;
}): Promise<
  | { ok: true; productIds: string[]; assetIds: string[] }
  | { ok: false; status: number; error: string }
> {
  const { data, error } = await supabase
    .from("partner_update_kit_items")
    .select("product_id,asset_id")
    .eq("organization_id", params.organizationId)
    .eq("partner_update_id", params.updateId);

  if (error) {
    return { ok: false, status: 500, error: "Failed to load kit access requirements" };
  }

  const productIds = new Set<string>();
  const assetIds = new Set<string>();

  for (const row of (data || []) as Array<{
    product_id: string | null;
    asset_id: string | null;
  }>) {
    if (row.product_id) productIds.add(row.product_id);
    if (row.asset_id) assetIds.add(row.asset_id);
  }

  return {
    ok: true,
    productIds: Array.from(productIds),
    assetIds: Array.from(assetIds),
  };
}

function formatBlockedRecipientAccessError(params: {
  blockedRecipients: Array<{
    partnerOrganizationId: string;
    missingProductIds: string[];
    missingAssetIds: string[];
  }>;
}): string {
  const blockedCount = params.blockedRecipients.length;
  const sample = params.blockedRecipients.slice(0, 3).map((row) => {
    const missingProductCount = row.missingProductIds.length;
    const missingAssetCount = row.missingAssetIds.length;
    return `${row.partnerOrganizationId} (missing ${missingProductCount} product${missingProductCount === 1 ? "" : "s"}, ${missingAssetCount} asset${missingAssetCount === 1 ? "" : "s"})`;
  });

  return [
    `${blockedCount} selected partner${blockedCount === 1 ? "" : "s"} cannot access all Kit items via current Share Set grants.`,
    "Assign or adjust Share Sets for those partners before sending this update.",
    sample.length > 0 ? `Examples: ${sample.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function validateRecipientKitAccess(params: {
  organizationId: string;
  updateId: string;
  partnerOrganizationIds: string[];
}): Promise<RecipientKitAccessCheckResult> {
  const partnerOrganizationIds = Array.from(new Set(params.partnerOrganizationIds));
  if (partnerOrganizationIds.length === 0) {
    return { ok: true };
  }

  const requiredResources = await loadUpdateKitResourceIds({
    organizationId: params.organizationId,
    updateId: params.updateId,
  });
  if (!requiredResources.ok) {
    return {
      ok: false,
      status: requiredResources.status,
      error: requiredResources.error,
      blockedRecipients: [],
    };
  }

  if (
    requiredResources.productIds.length === 0 &&
    requiredResources.assetIds.length === 0
  ) {
    return { ok: true };
  }

  const blockedRecipients: Array<{
    partnerOrganizationId: string;
    missingProductIds: string[];
    missingAssetIds: string[];
  }> = [];

  for (const partnerOrganizationId of partnerOrganizationIds) {
    const [grantedProducts, grantedAssets] = await Promise.all([
      resolvePartnerGrantedProductIds({
        brandOrganizationId: params.organizationId,
        partnerOrganizationId,
      }),
      resolvePartnerGrantedAssetIds({
        brandOrganizationId: params.organizationId,
        partnerOrganizationId,
      }),
    ]);

    if (!grantedProducts.foundationAvailable || !grantedAssets.foundationAvailable) {
      return {
        ok: false,
        status: 503,
        error:
          "Share Set visibility foundation is unavailable. Apply latest sharing migrations first.",
        blockedRecipients: [],
      };
    }

    const grantedProductIds = new Set(grantedProducts.productIds);
    const grantedAssetIds = new Set(grantedAssets.assetIds);

    const missingProductIds = requiredResources.productIds.filter(
      (id) => !grantedProductIds.has(id)
    );
    const missingAssetIds = requiredResources.assetIds.filter(
      (id) => !grantedAssetIds.has(id)
    );

    if (missingProductIds.length > 0 || missingAssetIds.length > 0) {
      blockedRecipients.push({
        partnerOrganizationId,
        missingProductIds,
        missingAssetIds,
      });
    }
  }

  if (blockedRecipients.length > 0) {
    return {
      ok: false,
      status: 400,
      error: formatBlockedRecipientAccessError({ blockedRecipients }),
      blockedRecipients,
    };
  }

  return { ok: true };
}

export async function getUpdateForDelivery(params: {
  organizationId: string;
  updateId: string;
}): Promise<
  | { ok: true; update: PartnerUpdateRecord }
  | { ok: false; status: number; error: string }
> {
  const { data, error } = await supabase
    .from("partner_updates")
    .select("id,title,summary,urgency,status,due_at,scheduled_for,published_at")
    .eq("organization_id", params.organizationId)
    .eq("id", params.updateId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: "Failed to load partner update" };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Partner update not found" };
  }

  return {
    ok: true,
    update: {
      id: String(data.id),
      title: String(data.title || ""),
      summary: data.summary ? String(data.summary) : null,
      urgency: String(data.urgency || "normal"),
      status: String(data.status || "draft").toLowerCase(),
      due_at: data.due_at ? String(data.due_at) : null,
      scheduled_for: data.scheduled_for ? String(data.scheduled_for) : null,
      published_at: data.published_at ? String(data.published_at) : null,
    },
  };
}

function evaluateChannelConsent(params: {
  globalStatus: ConsentStatus;
  brandStatus: ConsentStatus;
}): ChannelConsentDecision {
  if (params.globalStatus !== "opted_in") {
    return { allowed: false, reason: "global_not_opted_in" };
  }
  if (params.brandStatus === "opted_out") {
    return { allowed: false, reason: "brand_opted_out" };
  }
  return { allowed: true, reason: "allowed" };
}

export async function resolveConsentDecisions(params: {
  organizationId: string;
  partnerOrganizationIds: string[];
}): Promise<Map<string, PartnerConsentDecision>> {
  const partnerIds = Array.from(new Set(params.partnerOrganizationIds));
  const decisions = new Map<string, PartnerConsentDecision>();
  if (partnerIds.length === 0) return decisions;

  const [globalRows, brandRows] = await Promise.all([
    supabase
      .from("partner_message_preferences")
      .select("partner_organization_id,channel,status")
      .in("partner_organization_id", partnerIds)
      .eq("scope_type", "global")
      .is("brand_organization_id", null)
      .in("channel", ["email", "sms"]),
    supabase
      .from("partner_message_preferences")
      .select("partner_organization_id,channel,status")
      .in("partner_organization_id", partnerIds)
      .eq("scope_type", "brand")
      .eq("brand_organization_id", params.organizationId)
      .in("channel", ["email", "sms"]),
  ]);

  if (globalRows.error && !isMissingTableError(globalRows.error)) {
    console.error("Failed to resolve global partner message preferences:", globalRows.error);
  }
  if (brandRows.error && !isMissingTableError(brandRows.error)) {
    console.error("Failed to resolve brand partner message preferences:", brandRows.error);
  }

  const globalByPartnerAndChannel = new Map<string, ConsentStatus>();
  const brandByPartnerAndChannel = new Map<string, ConsentStatus>();

  for (const row of (globalRows.data || []) as Array<{
    partner_organization_id: string | null;
    channel: string | null;
    status: string | null;
  }>) {
    if (!row.partner_organization_id || !row.channel) continue;
    const channel = String(row.channel).toLowerCase();
    if (channel !== "email" && channel !== "sms") continue;
    const status = row.status === "opted_out" ? "opted_out" : row.status === "opted_in" ? "opted_in" : null;
    globalByPartnerAndChannel.set(`${row.partner_organization_id}:${channel}`, status);
  }

  for (const row of (brandRows.data || []) as Array<{
    partner_organization_id: string | null;
    channel: string | null;
    status: string | null;
  }>) {
    if (!row.partner_organization_id || !row.channel) continue;
    const channel = String(row.channel).toLowerCase();
    if (channel !== "email" && channel !== "sms") continue;
    const status = row.status === "opted_out" ? "opted_out" : row.status === "opted_in" ? "opted_in" : null;
    brandByPartnerAndChannel.set(`${row.partner_organization_id}:${channel}`, status);
  }

  for (const partnerOrganizationId of partnerIds) {
    const email = evaluateChannelConsent({
      globalStatus: globalByPartnerAndChannel.get(`${partnerOrganizationId}:email`) || null,
      brandStatus: brandByPartnerAndChannel.get(`${partnerOrganizationId}:email`) || null,
    });
    const sms = evaluateChannelConsent({
      globalStatus: globalByPartnerAndChannel.get(`${partnerOrganizationId}:sms`) || null,
      brandStatus: brandByPartnerAndChannel.get(`${partnerOrganizationId}:sms`) || null,
    });
    decisions.set(partnerOrganizationId, { email, sms });
  }

  return decisions;
}

export async function buildRecipientDispatchDecisions(params: {
  organizationId: string;
  partnerOrganizationIds: string[];
  requestedChannels: DeliveryChannel[];
}): Promise<RecipientDispatchDecision[]> {
  const uniquePartnerIds = Array.from(new Set(params.partnerOrganizationIds));
  const consentByPartner = await resolveConsentDecisions({
    organizationId: params.organizationId,
    partnerOrganizationIds: uniquePartnerIds,
  });

  return uniquePartnerIds.map((partnerOrganizationId) => {
    const consent =
      consentByPartner.get(partnerOrganizationId) ||
      ({
        email: { allowed: false, reason: "global_not_opted_in" },
        sms: { allowed: false, reason: "global_not_opted_in" },
      } satisfies PartnerConsentDecision);

    const deliveryChannels = new Set<DeliveryChannel>(["in_app"]);
    if (params.requestedChannels.includes("email") && consent.email.allowed) {
      deliveryChannels.add("email");
    }
    if (params.requestedChannels.includes("sms") && consent.sms.allowed) {
      deliveryChannels.add("sms");
    }

    return {
      partnerOrganizationId,
      deliveryChannels: Array.from(deliveryChannels),
      consent,
    };
  });
}

export async function upsertPartnerUpdateRecipients(params: {
  organizationId: string;
  updateId: string;
  dueAt: string | null;
  recipients: RecipientDispatchDecision[];
  status: "queued" | "notified";
}): Promise<
  | {
      ok: true;
      rows: Array<{ id: string; partnerOrganizationId: string; status: string }>;
    }
  | { ok: false; status: number; error: string }
> {
  if (params.recipients.length === 0) {
    return { ok: true, rows: [] };
  }

  const rows = params.recipients.map((recipient) => ({
    organization_id: params.organizationId,
    partner_update_id: params.updateId,
    partner_organization_id: recipient.partnerOrganizationId,
    delivery_channels: recipient.deliveryChannels,
    status: params.status,
    due_at: params.dueAt,
    metadata: {
      consent: recipient.consent,
    },
  }));

  const { data, error } = await supabase
    .from("partner_update_recipients")
    .upsert(rows, {
      onConflict: "partner_update_id,partner_organization_id",
    })
    .select("id,partner_organization_id,status");

  if (error) {
    return { ok: false, status: 500, error: "Failed to save partner recipients" };
  }

  return {
    ok: true,
    rows: ((data || []) as Array<{
      id: string | null;
      partner_organization_id: string | null;
      status: string | null;
    }>)
      .filter((row) => Boolean(row.id) && Boolean(row.partner_organization_id))
      .map((row) => ({
        id: String(row.id),
        partnerOrganizationId: String(row.partner_organization_id),
        status: String(row.status || "queued"),
      })),
  };
}

export async function appendUpdateActivity(params: {
  organizationId: string;
  updateId: string;
  actorUserId?: string | null;
  rows: Array<{
    partnerOrganizationId?: string | null;
    eventType: string;
    metadata?: Record<string, unknown>;
    eventAt?: string;
  }>;
}): Promise<void> {
  if (params.rows.length === 0) return;

  const inserts: Database["public"]["Tables"]["partner_update_activity"]["Insert"][] = params.rows.map((row) => ({
    organization_id: params.organizationId,
    partner_update_id: params.updateId,
    partner_organization_id: row.partnerOrganizationId || null,
    actor_user_id: params.actorUserId || null,
    event_type: row.eventType,
    event_at: row.eventAt || new Date().toISOString(),
    metadata: (row.metadata || {}) as Json,
  }));

  const { error } = await supabase.from("partner_update_activity").insert(inserts);
  if (error) {
    console.error("Failed to append partner update activity:", error);
  }
}

export async function setPublishedUpdateState(params: {
  organizationId: string;
  updateId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("partner_updates")
    .update({
      status: "published",
      published_at: nowIso,
      scheduled_for: null,
      updated_by: params.userId,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.updateId)
    .in("status", ["draft", "scheduled"])
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: "Failed to publish update" };
  }
  if (!data) {
    return {
      ok: false,
      status: 400,
      error: "Only draft or scheduled updates can be published",
    };
  }

  return { ok: true };
}

export async function setScheduledUpdateState(params: {
  organizationId: string;
  updateId: string;
  userId: string;
  scheduledFor: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await supabase
    .from("partner_updates")
    .update({
      status: "scheduled",
      scheduled_for: params.scheduledFor,
      updated_by: params.userId,
    })
    .eq("organization_id", params.organizationId)
    .eq("id", params.updateId)
    .in("status", ["draft", "scheduled"])
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: "Failed to schedule update" };
  }
  if (!data) {
    return {
      ok: false,
      status: 400,
      error: "Only draft or scheduled updates can be scheduled",
    };
  }

  return { ok: true };
}

export async function resolvePartnerEmailTargets(params: {
  partnerOrganizationIds: string[];
}): Promise<EmailTarget[]> {
  const partnerOrganizationIds = Array.from(new Set(params.partnerOrganizationIds));
  if (partnerOrganizationIds.length === 0) return [];

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id,email,role,status")
    .in("organization_id", partnerOrganizationIds)
    .eq("status", "active")
    .not("email", "is", null);

  if (error) {
    console.error("Failed to resolve partner email recipients:", error);
    return [];
  }

  const byPartner = new Map<
    string,
    { adminEmails: string[]; memberEmails: string[] }
  >();

  for (const row of (data || []) as Array<{
    organization_id: string | null;
    email: string | null;
    role: string | null;
  }>) {
    if (!row.organization_id || !row.email) continue;
    const existing = byPartner.get(row.organization_id) || {
      adminEmails: [],
      memberEmails: [],
    };
    const normalizedRole = String(row.role || "").toLowerCase();
    if (normalizedRole === "owner" || normalizedRole === "admin") {
      existing.adminEmails.push(row.email);
    } else {
      existing.memberEmails.push(row.email);
    }
    byPartner.set(row.organization_id, existing);
  }

  return partnerOrganizationIds.map((partnerOrganizationId) => {
    const bucket = byPartner.get(partnerOrganizationId) || {
      adminEmails: [],
      memberEmails: [],
    };
    const adminEmails = sanitizeEmails(bucket.adminEmails);
    const memberEmails = sanitizeEmails(bucket.memberEmails);
    return {
      partnerOrganizationId,
      emails: adminEmails.length > 0 ? adminEmails : memberEmails,
    };
  });
}

export function buildUpdateEmailUrl(params: {
  brandTenantSlug: string;
  partnerOrgSlug?: string | null;
  updateId?: string | null;
}): string | null {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (!appUrl) return null;
  try {
    const url = new URL(appUrl);
    if (params.partnerOrgSlug && params.updateId) {
      url.pathname = `/${params.partnerOrgSlug}/view/${params.brandTenantSlug}/updates/${params.updateId}`;
    } else {
      url.pathname = "/notifications";
      url.searchParams.set("brand", params.brandTenantSlug);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function getEmailSender(): Resend | null {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

const URGENCY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: "#fef2f2", text: "#b91c1c" },
  high:     { bg: "#fff7ed", text: "#c2410c" },
  normal:   { bg: "#eff6ff", text: "#1d4ed8" },
  low:      { bg: "#f9fafb", text: "#6b7280" },
};

function buildPartnerUpdateEmailHtml(params: {
  brandLabel: string;
  updateTitle: string;
  summary: string | null;
  urgency: string;
  dueAt: string | null;
  ctaUrl: string | null;
  isReminder: boolean;
}): string {
  const urgencyKey = (params.urgency || "normal").toLowerCase();
  const urgencyColor = URGENCY_COLORS[urgencyKey] ?? URGENCY_COLORS.normal;
  const urgencyLabel = urgencyKey.charAt(0).toUpperCase() + urgencyKey.slice(1);

  const dueDateText = params.dueAt
    ? new Date(params.dueAt).toLocaleDateString("en-US", { dateStyle: "long" })
    : null;

  const summary = params.summary || "";
  const isReminder = params.isReminder;

  const ctaLabel = isReminder ? "View Update" : "Open Kit";
  const ctaBlock = params.ctaUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
         <tr>
           <td>
             <a href="${params.ctaUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.01em;">
               ${ctaLabel} →
             </a>
           </td>
         </tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${params.updateTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:16px;">
              <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">
                ${isReminder ? "Reminder from" : "New update from"} ${params.brandLabel}
              </p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">

              <!-- Urgency bar -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${urgencyColor.bg};padding:10px 24px;">
                    <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${urgencyColor.text};">
                      ${urgencyLabel}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:28px 28px 8px;">
                    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
                      ${params.updateTitle}
                    </h1>
                    ${summary ? `<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">${summary}</p>` : ""}
                    ${dueDateText
                      ? `<p style="margin:0;font-size:13px;color:#6b7280;">
                           <span style="font-weight:600;color:#111827;">Due:</span> ${dueDateText}
                         </p>`
                      : ""}
                    ${ctaBlock}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because you're a partner of ${params.brandLabel}.
                Powered by <a href="https://stackcess.com" style="color:#6b7280;text-decoration:none;">Stackcess</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendUpdateEmails(params: {
  brandLabel: string;
  brandTenantSlug: string;
  update: PartnerUpdateRecord;
  recipients: Array<{ partnerOrganizationId: string; emails: string[] }>;
  isReminder: boolean;
}): Promise<
  Array<{
    partnerOrganizationId: string;
    success: boolean;
    providerMessageId?: string;
    errorReason?: string;
  }>
> {
  const sender = getEmailSender();
  if (!sender) {
    return params.recipients.map((recipient) => ({
      partnerOrganizationId: recipient.partnerOrganizationId,
      success: false,
      errorReason: "resend_not_configured",
    }));
  }

  const from = (process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev").trim();

  // Batch-fetch partner org slugs so each email CTA links directly to the update
  const partnerOrgIds = params.recipients.map((r) => r.partnerOrganizationId).filter(Boolean);
  const partnerSlugMap: Record<string, string> = {};
  if (partnerOrgIds.length > 0) {
    const { data: orgRows } = await supabase
      .from("organizations")
      .select("id,slug")
      .in("id", partnerOrgIds);
    for (const row of (orgRows || []) as Array<{ id: string; slug: string }>) {
      if (row.id && row.slug) partnerSlugMap[row.id] = row.slug;
    }
  }

  const subjectPrefix = params.isReminder ? "Reminder:" : "New update:";
  const subject = `${subjectPrefix} ${params.update.title}`;

  const outcomes: Array<{
    partnerOrganizationId: string;
    success: boolean;
    providerMessageId?: string;
    errorReason?: string;
  }> = [];

  for (const recipient of params.recipients) {
    if (recipient.emails.length === 0) {
      outcomes.push({
        partnerOrganizationId: recipient.partnerOrganizationId,
        success: false,
        errorReason: "no_recipient_emails",
      });
      continue;
    }

    const partnerSlug = partnerSlugMap[recipient.partnerOrganizationId] ?? null;
    const ctaUrl = buildUpdateEmailUrl({
      brandTenantSlug: params.brandTenantSlug,
      partnerOrgSlug: partnerSlug,
      updateId: params.update.id,
    });

    const { data, error } = await sender.emails.send({
      from,
      to: recipient.emails,
      subject,
      html: buildPartnerUpdateEmailHtml({
        brandLabel: params.brandLabel,
        updateTitle: params.update.title,
        summary: params.update.summary,
        urgency: params.update.urgency,
        dueAt: params.update.due_at,
        ctaUrl,
        isReminder: params.isReminder,
      }),
    });

    if (error) {
      outcomes.push({
        partnerOrganizationId: recipient.partnerOrganizationId,
        success: false,
        errorReason: String(error.message || "provider_error"),
      });
      continue;
    }

    outcomes.push({
      partnerOrganizationId: recipient.partnerOrganizationId,
      success: true,
      providerMessageId: data?.id || undefined,
    });
  }

  return outcomes;
}

export async function markRecipientsNotified(params: {
  organizationId: string;
  updateId: string;
  partnerOrganizationIds: string[];
}): Promise<void> {
  const partnerIds = Array.from(new Set(params.partnerOrganizationIds));
  if (partnerIds.length === 0) return;

  const nowIso = new Date().toISOString();
  const { error: statusError } = await supabase
    .from("partner_update_recipients")
    .update({
      status: "notified",
    })
    .eq("organization_id", params.organizationId)
    .eq("partner_update_id", params.updateId)
    .in("partner_organization_id", partnerIds)
    .in("status", Array.from(PARTNER_NOTIFICATION_RECIPIENT_STATUSES));

  if (statusError) {
    console.error("Failed to mark partner update recipients as notified:", statusError);
  }

  const { error: firstNotifiedError } = await supabase
    .from("partner_update_recipients")
    .update({
      first_notified_at: nowIso,
    })
    .eq("organization_id", params.organizationId)
    .eq("partner_update_id", params.updateId)
    .in("partner_organization_id", partnerIds)
    .is("first_notified_at", null);

  if (firstNotifiedError) {
    console.error(
      "Failed to set first_notified_at on partner update recipients:",
      firstNotifiedError
    );
  }
}

export async function loadExistingUpdateRecipients(params: {
  organizationId: string;
  updateId: string;
  partnerOrganizationIds?: string[];
}): Promise<
  Array<{
    id: string;
    partnerOrganizationId: string;
    deliveryChannels: DeliveryChannel[];
    status: string;
  }>
> {
  let query = supabase
    .from("partner_update_recipients")
    .select("id,partner_organization_id,delivery_channels,status")
    .eq("organization_id", params.organizationId)
    .eq("partner_update_id", params.updateId);

  if (params.partnerOrganizationIds && params.partnerOrganizationIds.length > 0) {
    query = query.in("partner_organization_id", params.partnerOrganizationIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to load existing partner update recipients:", error);
    return [];
  }

  return ((data || []) as Array<{
    id: string | null;
    partner_organization_id: string | null;
    delivery_channels: string[] | null;
    status: string | null;
  }>)
    .filter((row) => Boolean(row.id) && Boolean(row.partner_organization_id))
    .map((row) => ({
      id: String(row.id),
      partnerOrganizationId: String(row.partner_organization_id),
      deliveryChannels: normalizeDeliveryChannels(row.delivery_channels || []),
      status: String(row.status || "queued"),
    }));
}


