export type AuthoringScopeMode = "global" | "scoped";

export type AuthoringScope = {
  mode: AuthoringScopeMode;
  marketIds: string[];
  channelIds: string[];
  localeIds: string[];
  destinationIds: string[];
};

export type AuthoringScopeTuple = {
  market_id: string | null;
  channel_id: string | null;
  locale_id: string | null;
  destination_id: string | null;
};

export type ScopeValidationResult =
  | {
      ok: true;
      scope: AuthoringScope;
      tuples: AuthoringScopeTuple[];
    }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
    };

export type ReplaceAssetScopeAssignmentsResult =
  | {
      ok: true;
      scope: AuthoringScope;
      tuples: AuthoringScopeTuple[];
    }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
    };

const MISSING_TABLE_CODE = "42P01";
const MISSING_RELATION_CODE = "PGRST205";

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const normalized = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const cleaned = entry.trim();
    if (!cleaned) continue;
    normalized.add(cleaned);
  }

  return Array.from(normalized);
}

export function createGlobalAuthoringScope(): AuthoringScope {
  return {
    mode: "global",
    marketIds: [],
    channelIds: [],
    localeIds: [],
    destinationIds: [],
  };
}

export function normalizeAuthoringScope(value: unknown): AuthoringScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  if (raw.mode !== "global" && raw.mode !== "scoped") {
    return null;
  }

  const scope: AuthoringScope = {
    mode: raw.mode,
    marketIds: normalizeStringArray(raw.marketIds),
    channelIds: normalizeStringArray(raw.channelIds),
    localeIds: normalizeStringArray(raw.localeIds),
    destinationIds: normalizeStringArray(raw.destinationIds),
  };

  if (scope.mode === "global") {
    return createGlobalAuthoringScope();
  }

  return scope;
}

function toDimension(values: string[]): Array<string | null> {
  return values.length > 0 ? values : [null];
}

export function expandAuthoringScopeToTuples(scope: AuthoringScope): AuthoringScopeTuple[] {
  if (scope.mode === "global") {
    return [
      {
        market_id: null,
        channel_id: null,
        locale_id: null,
        destination_id: null,
      },
    ];
  }

  const tuples: AuthoringScopeTuple[] = [];
  const seen = new Set<string>();

  for (const marketId of toDimension(scope.marketIds)) {
    for (const channelId of toDimension(scope.channelIds)) {
      for (const localeId of toDimension(scope.localeIds)) {
        for (const destinationId of toDimension(scope.destinationIds)) {
          const tuple: AuthoringScopeTuple = {
            market_id: marketId,
            channel_id: channelId,
            locale_id: localeId,
            destination_id: destinationId,
          };
          const key = `${tuple.market_id || "_"}|${tuple.channel_id || "_"}|${
            tuple.locale_id || "_"
          }|${tuple.destination_id || "_"}`;
          if (seen.has(key)) continue;
          seen.add(key);
          tuples.push(tuple);
        }
      }
    }
  }

  return tuples;
}

function buildMissingIdsMessage(kind: string, missingIds: string[]): string {
  const preview = missingIds.slice(0, 5).join(", ");
  const suffix = missingIds.length > 5 ? ` (+${missingIds.length - 5} more)` : "";
  return `Invalid ${kind} selection: ${preview}${suffix}`;
}

function splitMissingIds(expected: string[], found: Array<{ id: string }>): string[] {
  const foundIds = new Set(found.map((row) => row.id));
  return expected.filter((id) => !foundIds.has(id));
}

export function isMissingAssetScopeAssignmentsFoundation(error: any): boolean {
  const code = String(error?.code || "");
  if (code === MISSING_TABLE_CODE || code === MISSING_RELATION_CODE) return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("asset_scope_assignments");
}

export async function validateAuthoringScope(params: {
  supabase: any;
  organizationId: string;
  rawScope: unknown;
}): Promise<ScopeValidationResult> {
  const { supabase, organizationId, rawScope } = params;

  const normalizedScope =
    rawScope === null ? createGlobalAuthoringScope() : normalizeAuthoringScope(rawScope);

  if (!normalizedScope) {
    return {
      ok: false,
      status: 400,
      error: "authoring scope must be an object with mode/global scoped arrays or null",
    };
  }

  const tuples = expandAuthoringScopeToTuples(normalizedScope);

  if (normalizedScope.mode === "global") {
    return { ok: true, scope: normalizedScope, tuples };
  }

  const marketIds = normalizedScope.marketIds;
  const channelIds = normalizedScope.channelIds;
  const localeIds = normalizedScope.localeIds;
  const destinationIds = normalizedScope.destinationIds;

  if (destinationIds.length > 0 && channelIds.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Destination scope requires at least one channel selection",
    };
  }

  if (marketIds.length > 0) {
    const { data, error } = await (supabase as any)
      .from("markets")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("id", marketIds);

    if (error) {
      return { ok: false, status: 500, error: "Failed to validate market scope" };
    }

    const rows = (data || []) as Array<{ id: string }>;
    const missingIds = splitMissingIds(marketIds, rows);
    if (missingIds.length > 0) {
      return {
        ok: false,
        status: 400,
        error: buildMissingIdsMessage("market", missingIds),
      };
    }
  }

  if (channelIds.length > 0) {
    const { data, error } = await (supabase as any)
      .from("channels")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("id", channelIds);

    if (error) {
      return { ok: false, status: 500, error: "Failed to validate channel scope" };
    }

    const rows = (data || []) as Array<{ id: string }>;
    const missingIds = splitMissingIds(channelIds, rows);
    if (missingIds.length > 0) {
      return {
        ok: false,
        status: 400,
        error: buildMissingIdsMessage("channel", missingIds),
      };
    }
  }

  if (localeIds.length > 0) {
    const { data, error } = await (supabase as any)
      .from("locales")
      .select("id")
      .eq("is_active", true)
      .in("id", localeIds);

    if (error) {
      return { ok: false, status: 500, error: "Failed to validate language scope" };
    }

    const rows = (data || []) as Array<{ id: string }>;
    const missingIds = splitMissingIds(localeIds, rows);
    if (missingIds.length > 0) {
      return {
        ok: false,
        status: 400,
        error: buildMissingIdsMessage("language", missingIds),
      };
    }
  }

  const destinationById = new Map<
    string,
    { id: string; channel_id: string | null; market_id: string | null }
  >();

  if (destinationIds.length > 0) {
    const { data, error } = await (supabase as any)
      .from("channel_destinations")
      .select("id,channel_id,market_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("id", destinationIds);

    if (error) {
      return { ok: false, status: 500, error: "Failed to validate destination scope" };
    }

    const rows = (data || []) as Array<{ id: string; channel_id: string | null; market_id: string | null }>;
    const missingIds = splitMissingIds(destinationIds, rows);
    if (missingIds.length > 0) {
      return {
        ok: false,
        status: 400,
        error: buildMissingIdsMessage("destination", missingIds),
      };
    }

    for (const row of rows) {
      destinationById.set(row.id, row);
    }
  }

  if (marketIds.length > 0 && localeIds.length > 0) {
    const { data, error } = await (supabase as any)
      .from("market_locales")
      .select("market_id,locale_id")
      .eq("is_active", true)
      .in("market_id", marketIds)
      .in("locale_id", localeIds);

    if (error) {
      return { ok: false, status: 500, error: "Failed to validate market-language scope compatibility" };
    }

    const allowedMarketLocalePairs = new Set<string>(
      ((data || []) as Array<{ market_id: string; locale_id: string }>).map(
        (row) => `${row.market_id}|${row.locale_id}`
      )
    );

    for (const tuple of tuples) {
      if (!tuple.market_id || !tuple.locale_id) continue;
      if (!allowedMarketLocalePairs.has(`${tuple.market_id}|${tuple.locale_id}`)) {
        return {
          ok: false,
          status: 400,
          error: "Selected language is not enabled for one or more selected markets",
        };
      }
    }
  }

  for (const tuple of tuples) {
    if (!tuple.destination_id) continue;

    const destination = destinationById.get(tuple.destination_id);
    if (!destination) {
      return {
        ok: false,
        status: 400,
        error: "Invalid destination selected",
      };
    }

    if (!tuple.channel_id) {
      return {
        ok: false,
        status: 400,
        error: "Destination scope requires channel on every tuple",
      };
    }

    if (destination.channel_id && destination.channel_id !== tuple.channel_id) {
      return {
        ok: false,
        status: 400,
        error: "Destination and channel scope selections are incompatible",
      };
    }

    if (destination.market_id && destination.market_id !== tuple.market_id) {
      return {
        ok: false,
        status: 400,
        error: "Destination and market scope selections are incompatible",
      };
    }
  }

  return {
    ok: true,
    scope: normalizedScope,
    tuples,
  };
}

export async function replaceAssetScopeAssignments(params: {
  supabase: any;
  organizationId: string;
  assetId: string;
  rawScope: unknown;
  source: "upload" | "bulk_edit" | "manual" | "rule";
  userId: string;
  metadata?: Record<string, unknown>;
}): Promise<ReplaceAssetScopeAssignmentsResult> {
  const validation = await validateAuthoringScope({
    supabase: params.supabase,
    organizationId: params.organizationId,
    rawScope: params.rawScope,
  });

  if (!validation.ok) {
    return validation;
  }

  const { tuples, scope } = validation;

  const { error: deleteError } = await (params.supabase as any)
    .from("asset_scope_assignments")
    .delete()
    .eq("organization_id", params.organizationId)
    .eq("asset_id", params.assetId);

  if (deleteError) {
    if (isMissingAssetScopeAssignmentsFoundation(deleteError)) {
      return {
        ok: false,
        status: 409,
        code: "ASSET_SCOPE_FOUNDATION_MISSING",
        error: "Asset scope assignments are not available until Phase B migrations are applied",
      };
    }
    return { ok: false, status: 500, error: "Failed to replace existing asset scope assignments" };
  }

  const rows = tuples.map((tuple) => ({
    organization_id: params.organizationId,
    asset_id: params.assetId,
    market_id: tuple.market_id,
    channel_id: tuple.channel_id,
    locale_id: tuple.locale_id,
    destination_id: tuple.destination_id,
    source: params.source,
    is_active: true,
    metadata: params.metadata || {},
    created_by: params.userId,
  }));

  const { error: insertError } = await (params.supabase as any)
    .from("asset_scope_assignments")
    .insert(rows);

  if (insertError) {
    if (isMissingAssetScopeAssignmentsFoundation(insertError)) {
      return {
        ok: false,
        status: 409,
        code: "ASSET_SCOPE_FOUNDATION_MISSING",
        error: "Asset scope assignments are not available until Phase B migrations are applied",
      };
    }
    return { ok: false, status: 500, error: "Failed to persist asset scope assignments" };
  }

  return {
    ok: true,
    scope,
    tuples,
  };
}
