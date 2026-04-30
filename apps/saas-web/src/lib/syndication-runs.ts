import { getSupabaseServer } from "@/lib/supabase";

export type DeliveryTarget = "portal" | "file_export" | "direct_channel";
export type SyndicationRunStatus = "completed" | "failed";
export type PortalPublishState = "published" | "revoked" | "archived";
export type ScopeSource = "selection" | "saved_scope";

export type SyndicationRunRecord = {
  id: string;
  organizationId: string;
  outputProfileId: string;
  shareSetId: string | null;
  sourceType: ScopeSource;
  deliveryTarget: DeliveryTarget;
  runStatus: SyndicationRunStatus;
  marketId: string | null;
  localeId: string | null;
  productCount: number;
  readyCount: number;
  warningCount: number;
  sourceMetadata: Record<string, unknown>;
  readinessSummary: Record<string, unknown>;
  previewMetadata: Record<string, unknown>;
  createdBy: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

export type PortalPublishRecord = {
  id: string;
  organizationId: string;
  syndicationRunId: string;
  outputProfileId: string;
  marketId: string | null;
  localeId: string | null;
  publishState: PortalPublishState;
  scopeMetadata: Record<string, unknown>;
  readinessSnapshot: Record<string, unknown>;
  metadata: Record<string, unknown>;
  publishedAt: string;
  createdBy: string | null;
  createdAt: string;
};

type SyndicationRunRow = {
  id: string;
  organization_id: string;
  output_profile_id: string;
  share_set_id: string | null;
  source_type: "selection" | "set";
  delivery_target: DeliveryTarget;
  run_status: SyndicationRunStatus;
  market_id: string | null;
  locale_id: string | null;
  product_count: number | null;
  ready_count: number | null;
  warning_count: number | null;
  source_metadata: Record<string, unknown> | null;
  readiness_summary: Record<string, unknown> | null;
  preview_metadata: Record<string, unknown> | null;
  created_by: string | null;
  delivered_at: string | null;
  created_at: string;
};

type PortalPublishRow = {
  id: string;
  organization_id: string;
  syndication_run_id: string;
  output_profile_id: string;
  market_id: string | null;
  locale_id: string | null;
  publish_state: PortalPublishState;
  scope_metadata: Record<string, unknown> | null;
  readiness_snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  published_at: string;
  created_by: string | null;
  created_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeSyndicationRun(row: SyndicationRunRow): SyndicationRunRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    outputProfileId: row.output_profile_id,
    shareSetId: row.share_set_id ?? null,
    sourceType: row.source_type === "set" ? "saved_scope" : "selection",
    deliveryTarget: row.delivery_target,
    runStatus: row.run_status,
    marketId: row.market_id ?? null,
    localeId: row.locale_id ?? null,
    productCount: typeof row.product_count === "number" ? row.product_count : 0,
    readyCount: typeof row.ready_count === "number" ? row.ready_count : 0,
    warningCount: typeof row.warning_count === "number" ? row.warning_count : 0,
    sourceMetadata: asObject(row.source_metadata),
    readinessSummary: asObject(row.readiness_summary),
    previewMetadata: asObject(row.preview_metadata),
    createdBy: row.created_by ?? null,
    deliveredAt: row.delivered_at ?? null,
    createdAt: row.created_at,
  };
}

export function normalizePortalPublish(row: PortalPublishRow): PortalPublishRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    syndicationRunId: row.syndication_run_id,
    outputProfileId: row.output_profile_id,
    marketId: row.market_id ?? null,
    localeId: row.locale_id ?? null,
    publishState: row.publish_state,
    scopeMetadata: asObject(row.scope_metadata),
    readinessSnapshot: asObject(row.readiness_snapshot),
    metadata: asObject(row.metadata),
    publishedAt: row.published_at,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

export async function createSyndicationRun(params: {
  organizationId: string;
  outputProfileId: string;
  shareSetId?: string | null;
  sourceType: ScopeSource;
  deliveryTarget: DeliveryTarget;
  marketId?: string | null;
  localeId?: string | null;
  productCount?: number;
  readyCount?: number;
  warningCount?: number;
  sourceMetadata?: Record<string, unknown>;
  readinessSummary?: Record<string, unknown>;
  previewMetadata?: Record<string, unknown>;
  createdBy?: string | null;
  deliveredAt?: string | null;
}): Promise<SyndicationRunRecord> {
  const { data, error } = await getSupabaseServer()
    .from("syndication_runs" as never)
    .insert(
      ({
        organization_id: params.organizationId,
        output_profile_id: params.outputProfileId,
        share_set_id: params.shareSetId ?? null,
        source_type: params.sourceType === "saved_scope" ? "set" : "selection",
        delivery_target: params.deliveryTarget,
        run_status: "completed",
        market_id: params.marketId ?? null,
        locale_id: params.localeId ?? null,
        product_count: params.productCount ?? 0,
        ready_count: params.readyCount ?? 0,
        warning_count: params.warningCount ?? 0,
        source_metadata: params.sourceMetadata ?? {},
        readiness_summary: params.readinessSummary ?? {},
        preview_metadata: params.previewMetadata ?? {},
        created_by: params.createdBy ?? null,
        delivered_at: params.deliveredAt ?? new Date().toISOString(),
      }) as never
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Failed to create syndication run.");
  }

  return normalizeSyndicationRun(data as unknown as SyndicationRunRow);
}

export async function createPortalPublish(params: {
  organizationId: string;
  syndicationRunId: string;
  outputProfileId: string;
  partnerOrganizationIds: string[];
  marketId?: string | null;
  localeId?: string | null;
  scopeMetadata?: Record<string, unknown>;
  readinessSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}): Promise<PortalPublishRecord> {
  const { data, error } = await getSupabaseServer()
    .from("portal_publishes" as never)
    .insert(
      ({
        organization_id: params.organizationId,
        syndication_run_id: params.syndicationRunId,
        output_profile_id: params.outputProfileId,
        market_id: params.marketId ?? null,
        locale_id: params.localeId ?? null,
        publish_state: "published",
        scope_metadata: params.scopeMetadata ?? {},
        readiness_snapshot: params.readinessSnapshot ?? {},
        metadata: params.metadata ?? {},
        created_by: params.createdBy ?? null,
      }) as never
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Failed to create portal publish.");
  }

  const publish = normalizePortalPublish(data as unknown as PortalPublishRow);

  if (params.partnerOrganizationIds.length > 0) {
    const audienceRows = params.partnerOrganizationIds.map((partnerOrganizationId) => ({
      organization_id: params.organizationId,
      portal_publish_id: publish.id,
      partner_organization_id: partnerOrganizationId,
      is_active: true,
    }));

    const { error: audienceError } = await getSupabaseServer()
      .from("portal_publish_audiences" as never)
      .upsert(audienceRows as never, {
        onConflict: "portal_publish_id,partner_organization_id",
        ignoreDuplicates: false,
      });

    if (audienceError) {
      throw new Error("Failed to assign portal publish audience.");
    }
  }

  return publish;
}

export async function listRecentSyndicationRuns(params: {
  organizationId: string;
  limit?: number;
}): Promise<SyndicationRunRecord[]> {
  const { data, error } = await getSupabaseServer()
    .from("syndication_runs" as never)
    .select("*")
    .eq("organization_id", params.organizationId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 10);

  if (error) {
    throw new Error("Failed to load recent syndication runs.");
  }

  return ((data || []) as unknown as SyndicationRunRow[]).map(normalizeSyndicationRun);
}

export async function listRecentPortalPublishes(params: {
  organizationId: string;
  partnerOrganizationId?: string | null;
  limit?: number;
}): Promise<PortalPublishRecord[]> {
  if (params.partnerOrganizationId) {
    const { data, error } = await getSupabaseServer()
      .from("portal_publish_audiences" as never)
      .select("portal_publishes!inner(*)")
      .eq("organization_id", params.organizationId)
      .eq("partner_organization_id", params.partnerOrganizationId)
      .eq("is_active", true)
      .limit(params.limit ?? 10);

    if (error) {
      throw new Error("Failed to load portal publishes.");
    }

    return ((data || []) as Array<{ portal_publishes: PortalPublishRow | PortalPublishRow[] | null }>)
      .map((row) =>
        Array.isArray(row.portal_publishes)
          ? row.portal_publishes[0] || null
          : row.portal_publishes || null
      )
      .filter((row): row is PortalPublishRow => Boolean(row))
      .map(normalizePortalPublish)
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      .slice(0, params.limit ?? 10);
  }

  const { data, error } = await getSupabaseServer()
    .from("portal_publishes" as never)
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("publish_state", "published")
    .order("published_at", { ascending: false })
    .limit(params.limit ?? 10);

  if (error) {
    throw new Error("Failed to load portal publishes.");
  }

  return ((data || []) as unknown as PortalPublishRow[]).map(normalizePortalPublish);
}
