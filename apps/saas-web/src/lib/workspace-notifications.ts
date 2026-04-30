import { getSupabaseServer } from "@/lib/supabase";
import { readOrganizationProfile } from "@/lib/organization-profile";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WorkspaceMembership {
  memberId: string;
  role: string;
  createdAt: string | null;
  lastAccessedAt: string | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    organizationType: "brand" | "partner";
    partnerCategory: "retailer" | "distributor" | "wholesaler" | null;
    logoUrl: string | null;
    storageUsed: number;
    storageLimit: number;
  };
}

export interface WorkspaceNotificationEvent {
  id: string;
  type:
    | "asset_added"
    | "product_added"
    | "share_granted"
    | "update_published"
    | "update_reminder";
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  title: string;
  description: string;
  createdAt: string;
  isRead: boolean;
  href: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resolveDirectPartnerOrganizationIds(
  memberships: WorkspaceMembership[]
): string[] {
  return memberships
    .filter(
      (membership) =>
        membership.organization.organizationType === "partner" &&
        !membership.memberId.startsWith("partner:")
    )
    .map((membership) => membership.organization.id);
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  const maybeMessage = String((error as { message?: string }).message || "");
  return (
    maybeCode === "42P01" ||
    maybeCode === "PGRST205" ||
    maybeMessage.includes("does not exist") ||
    maybeMessage.includes("schema cache")
  );
}

export async function getActiveWorkspaceMemberships(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
  options?: {
    includePartnerBrandAccess?: boolean;
    includeEmailLookup?: boolean;
  }
): Promise<WorkspaceMembership[]> {
  const membershipSelect = `
      id,
      kinde_user_id,
      role,
      created_at,
      last_accessed_at,
      organization:organizations (*)
    `;

  const { data, error } = await getSupabaseServer()
    .from("organization_members")
    .select(membershipSelect)
    .eq("kinde_user_id", userId)
    .eq("status", "active");

  if (error || !data) {
    throw error || new Error("Failed to load workspace memberships");
  }

  const rowsById = new Map<string, Record<string, unknown>>();
  for (const row of (data || []) as unknown[]) {
    if (isRecord(row) && typeof row.id === "string") rowsById.set(row.id, row);
  }

  const includeEmailLookup = options?.includeEmailLookup ?? true;
  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (includeEmailLookup && normalizedEmail.length > 0) {
    const { data: emailData, error: emailError } = await getSupabaseServer()
      .from("organization_members")
      .select(membershipSelect)
      .ilike("email", normalizedEmail)
      .eq("status", "active");

    if (emailError) {
      throw emailError;
    }

    const relinkIds: string[] = [];
    for (const row of (emailData || []) as unknown[]) {
      if (isRecord(row) && typeof row.id === "string") {
        rowsById.set(row.id, row);
        if (row.kinde_user_id !== userId) {
          relinkIds.push(row.id);
        }
      }
    }

    if (relinkIds.length > 0) {
      await getSupabaseServer()
        .from("organization_members")
        .update({
          kinde_user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .in("id", relinkIds);
    }
  }

  const directMemberships = Array.from(rowsById.values())
    .map((membership) => {
      const rawOrganization = membership?.organization ?? membership?.organizations;
      const organization = Array.isArray(rawOrganization)
        ? rawOrganization[0]
        : rawOrganization;
      if (!isRecord(organization) || !organization.id || !organization.slug) return null;
      const profile = readOrganizationProfile(organization as Record<string, unknown>);
      return {
        memberId: String(membership.id),
        role: String(membership.role ?? "member"),
        createdAt: typeof membership.created_at === "string" ? membership.created_at : null,
        lastAccessedAt:
          typeof membership.last_accessed_at === "string" ? membership.last_accessed_at : null,
        organization: {
          id: String(organization.id),
          name: String(organization.name ?? organization.slug),
          slug: String(organization.slug),
          organizationType: organization.organization_type === "partner" ? "partner" : "brand",
          partnerCategory:
            organization.partner_category === "retailer" ||
            organization.partner_category === "distributor" ||
            organization.partner_category === "wholesaler"
              ? organization.partner_category
              : null,
          logoUrl: profile.logoUrl ?? null,
          storageUsed:
            typeof organization.storage_used === "number" ? organization.storage_used : 0,
          storageLimit:
            typeof organization.storage_limit === "number"
              ? organization.storage_limit
              : 1073741824,
        },
      } satisfies WorkspaceMembership;
    })
    .filter((membership): membership is WorkspaceMembership => membership !== null);

  const includePartnerBrandAccess = options?.includePartnerBrandAccess ?? true;
  if (!includePartnerBrandAccess) {
    return directMemberships;
  }

  const partnerOrganizationIds = directMemberships
    .filter((membership) => membership.organization.organizationType === "partner")
    .map((membership) => membership.organization.id);

  if (partnerOrganizationIds.length === 0) {
    return directMemberships;
  }

  // Primary path: current schema with explicit organization FK naming.
  const { data: partnerRowsV2, error: partnerRowsV2Error } = await getSupabaseServer()
    .from("brand_partner_relationships")
    .select("id, access_level, created_at, brand_organization_id")
    .in("partner_organization_id", partnerOrganizationIds)
    .eq("status", "active");

  let partnerRows: Array<{
    id: string;
    created_at: string | null;
    brand_id: string;
  }> = [];

  if (!partnerRowsV2Error && Array.isArray(partnerRowsV2)) {
    partnerRows = (partnerRowsV2 as Array<unknown>)
      .filter((row): row is Record<string, unknown> => isRecord(row) && !!row.brand_organization_id)
      .map((row) => ({
        id: String(row.id),
        created_at: typeof row.created_at === "string" ? row.created_at : null,
        brand_id: String(row.brand_organization_id),
      }));
  } else {
    // Fallback path: legacy schema variants used brand_id/partner_id columns.
    const { data: partnerRowsV1, error: partnerRowsV1Error } = await getSupabaseServer()
      .from("brand_partner_relationships")
      .select("id, created_at, brand_id")
      .in("partner_id", partnerOrganizationIds)
      .eq("status", "active");

    if (!partnerRowsV1Error && Array.isArray(partnerRowsV1)) {
      partnerRows = (partnerRowsV1 as Array<unknown>)
        .filter((row): row is Record<string, unknown> => isRecord(row) && !!row.brand_id)
        .map((row) => ({
          id: String(row.id),
          created_at: typeof row.created_at === "string" ? row.created_at : null,
          brand_id: String(row.brand_id),
        }));
    }
  }

  if (partnerRows.length === 0) {
    return directMemberships;
  }

  const brandIds = Array.from(new Set(partnerRows.map((row) => row.brand_id)));
  const { data: brands, error: brandsError } = await getSupabaseServer()
    .from("organizations")
    .select("*")
    .in("id", brandIds);

  if (brandsError || !Array.isArray(brands)) {
    return directMemberships;
  }

  const brandsById = new Map<string, Record<string, unknown>>();
  for (const brand of brands as Array<unknown>) {
    if (isRecord(brand) && brand.id) {
      brandsById.set(String(brand.id), brand);
    }
  }

  const merged = new Map<string, WorkspaceMembership>();
  for (const membership of directMemberships) {
    merged.set(membership.organization.id, membership);
  }

  for (const row of partnerRows) {
    const brand = brandsById.get(row.brand_id);
    if (!brand?.id || !brand?.slug) continue;
    const brandId = String(brand.id);
    const brandSlug = String(brand.slug);
    if (merged.has(brandId)) continue;
    const profile = readOrganizationProfile(brand as Record<string, unknown>);

    merged.set(brandId, {
      memberId: `partner:${String(row.id)}`,
      role: "partner",
      createdAt: row.created_at ?? null,
      lastAccessedAt: null,
      organization: {
        id: brandId,
        name: String(brand.name ?? brandSlug),
        slug: brandSlug,
        organizationType: brand.organization_type === "partner" ? "partner" : "brand",
        partnerCategory:
          brand.partner_category === "retailer" ||
          brand.partner_category === "distributor" ||
          brand.partner_category === "wholesaler"
            ? brand.partner_category
            : null,
        logoUrl: profile.logoUrl ?? null,
        storageUsed: typeof brand.storage_used === "number" ? brand.storage_used : 0,
        storageLimit:
          typeof brand.storage_limit === "number" ? brand.storage_limit : 1073741824,
      },
    });
  }

  return Array.from(merged.values());
}

export async function getWorkspaceNotificationStateMap(
  supabase: SupabaseClient,
  userId: string,
  organizationIds: string[]
): Promise<Map<string, string>> {
  const stateByWorkspace = new Map<string, string>();

  if (organizationIds.length === 0) {
    return stateByWorkspace;
  }

  const { data, error } = await getSupabaseServer()
    .from("user_workspace_notification_state")
    .select("organization_id,last_read_at")
    .eq("kinde_user_id", userId)
    .in("organization_id", organizationIds);

  if (error) {
    if (isMissingRelationError(error)) {
      return stateByWorkspace;
    }
    throw error;
  }

  for (const row of (data || [])) {
    if (row.organization_id && row.last_read_at) {
      stateByWorkspace.set(row.organization_id, row.last_read_at);
    }
  }

  return stateByWorkspace;
}

function toIsoOrFallback(value: string | null | undefined, fallback: Date): string {
  if (!value) return fallback.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback.toISOString();
  return parsed.toISOString();
}

export async function getWorkspaceUnreadCounts(
  supabase: SupabaseClient,
  memberships: WorkspaceMembership[],
  stateByWorkspace: Map<string, string>
): Promise<Map<string, number>> {
  const unreadByWorkspace = new Map<string, number>();
  const fallbackWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const partnerOrganizationIds = resolveDirectPartnerOrganizationIds(memberships);

  await Promise.all(
    memberships.map(async (membership) => {
      const organizationId = membership.organization.id;
      const lastReadAt = stateByWorkspace.get(organizationId);
      const baseline = lastReadAt || membership.lastAccessedAt;
      const sinceIso = toIsoOrFallback(baseline, fallbackWindowStart);

      const [
        { count: assetCount },
        { count: productCount },
        { count: shareCount },
        { count: updateCount },
      ] = await Promise.all([
          getSupabaseServer()
            .from("dam_assets")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .gt("created_at", sinceIso),
          getSupabaseServer()
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .gt("created_at", sinceIso),
          getSupabaseServer()
            .from("security_audit_logs")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("action", "container.share.granted")
            .gt("created_at", sinceIso),
          membership.organization.organizationType === "brand" &&
          partnerOrganizationIds.length > 0
            ? getSupabaseServer()
                .from("partner_update_recipients")
                .select("id", { count: "exact", head: true })
                .eq("organization_id", organizationId)
                .in("partner_organization_id", partnerOrganizationIds)
                .gt("updated_at", sinceIso)
                .neq("status", "muted")
            : Promise.resolve({ count: 0 }),
        ]);

      unreadByWorkspace.set(
        organizationId,
        (assetCount ?? 0) +
          (productCount ?? 0) +
          (shareCount ?? 0) +
          (updateCount ?? 0)
      );
    })
  );

  return unreadByWorkspace;
}

export async function getWorkspaceNotificationEvents(
  supabase: SupabaseClient,
  memberships: WorkspaceMembership[],
  stateByWorkspace: Map<string, string>,
  limit: number,
  organizationSlug?: string
): Promise<WorkspaceNotificationEvent[]> {
  const membershipsById = new Map(
    memberships.map((membership) => [membership.organization.id, membership])
  );
  const organizationsById = new Map(
    memberships.map((membership) => [membership.organization.id, membership.organization])
  );
  const organizationIds = memberships.map((membership) => membership.organization.id);
  const filteredOrganizationIds = organizationSlug
    ? memberships
        .filter((membership) => membership.organization.slug === organizationSlug)
        .map((membership) => membership.organization.id)
    : organizationIds;

  if (filteredOrganizationIds.length === 0) {
    return [];
  }

  const queryLimit = Math.max(limit * 3, 60);
  const fallbackWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const partnerOrganizationIds = resolveDirectPartnerOrganizationIds(memberships);

  const [
    { data: assets },
    { data: products },
    { data: shares },
    { data: updateRecipients },
    { data: reminderEvents },
  ] = await Promise.all([
    getSupabaseServer()
      .from("dam_assets")
      .select("id,organization_id,filename,created_at")
      .in("organization_id", filteredOrganizationIds)
      .gte("created_at", fallbackWindowStart)
      .order("created_at", { ascending: false })
      .limit(queryLimit),
    getSupabaseServer()
      .from("products")
      .select("id,organization_id,product_name,sku,created_at")
      .in("organization_id", filteredOrganizationIds)
      .gte("created_at", fallbackWindowStart)
      .order("created_at", { ascending: false })
      .limit(queryLimit),
    getSupabaseServer()
      .from("security_audit_logs")
      .select("id,organization_id,action,metadata,created_at")
      .in("organization_id", filteredOrganizationIds)
      .eq("action", "container.share.granted")
      .gte("created_at", fallbackWindowStart)
      .order("created_at", { ascending: false })
      .limit(queryLimit),
    partnerOrganizationIds.length > 0
      ? getSupabaseServer()
          .from("partner_update_recipients")
          .select(
            "id,organization_id,partner_update_id,partner_organization_id,status,first_notified_at,updated_at,created_at"
          )
          .in("organization_id", filteredOrganizationIds)
          .in("partner_organization_id", partnerOrganizationIds)
          .neq("status", "muted")
          .gte("updated_at", fallbackWindowStart)
          .order("updated_at", { ascending: false })
          .limit(queryLimit)
      : Promise.resolve({ data: [] }),
    partnerOrganizationIds.length > 0
      ? getSupabaseServer()
          .from("partner_update_activity")
          .select("id,organization_id,partner_update_id,partner_organization_id,event_at,metadata")
          .in("organization_id", filteredOrganizationIds)
          .in("partner_organization_id", partnerOrganizationIds)
          .eq("event_type", "reminder_sent")
          .gte("event_at", fallbackWindowStart)
          .order("event_at", { ascending: false })
          .limit(queryLimit)
      : Promise.resolve({ data: [] }),
  ]);

  const events: WorkspaceNotificationEvent[] = [];
  const defaultPartnerWorkspaceSlug =
    memberships.find((membership) => membership.organization.organizationType === "partner")
      ?.organization.slug || null;
  const getSharedBrandHref = (brandSlug: string, suffix: string) => {
    if (!defaultPartnerWorkspaceSlug) {
      return "/home";
    }
    return `/${defaultPartnerWorkspaceSlug}/view/${encodeURIComponent(brandSlug)}${suffix}`;
  };

  for (const row of (assets || []) as Array<{
    id: string;
    organization_id: string;
    filename: string;
    created_at: string;
  }>) {
    const membership = membershipsById.get(row.organization_id);
    const organization = organizationsById.get(row.organization_id);
    if (!organization) continue;
    const isSharedBrand =
      membership?.role === "partner" && organization.organizationType === "brand";
    const sharedBrandHref = getSharedBrandHref(organization.slug, "/assets");
    const lastReadAt = stateByWorkspace.get(row.organization_id);
    const isRead = Boolean(lastReadAt && new Date(row.created_at) <= new Date(lastReadAt));
    events.push({
      id: `asset:${row.id}`,
      type: "asset_added",
      organizationId: row.organization_id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      title: "New asset added",
      description: row.filename || "A new asset was added.",
      createdAt: row.created_at,
      isRead,
      href: isSharedBrand ? sharedBrandHref : `/${organization.slug}/assets`,
    });
  }

  for (const row of (products || []) as Array<{
    id: string;
    organization_id: string;
    product_name: string;
    sku: string | null;
    created_at: string;
  }>) {
    const membership = membershipsById.get(row.organization_id);
    const organization = organizationsById.get(row.organization_id);
    if (!organization) continue;
    const isSharedBrand =
      membership?.role === "partner" && organization.organizationType === "brand";
    const sharedBrandHref = getSharedBrandHref(organization.slug, "/products");
    const lastReadAt = stateByWorkspace.get(row.organization_id);
    const isRead = Boolean(lastReadAt && new Date(row.created_at) <= new Date(lastReadAt));
    const skuSuffix = row.sku ? ` (${row.sku})` : "";
    events.push({
      id: `product:${row.id}`,
      type: "product_added",
      organizationId: row.organization_id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      title: "New product added",
      description: `${row.product_name || "Untitled product"}${skuSuffix}`,
      createdAt: row.created_at,
      isRead,
      href: isSharedBrand ? sharedBrandHref : `/${organization.slug}/products`,
    });
  }

  for (const row of (shares || []) as Array<{
    id: string;
    organization_id: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>) {
    const membership = membershipsById.get(row.organization_id);
    const organization = organizationsById.get(row.organization_id);
    if (!organization) continue;
    const isSharedBrand =
      membership?.role === "partner" && organization.organizationType === "brand";
    const sharedBrandHref = getSharedBrandHref(organization.slug, "/products");
    const metadata = row.metadata || {};
    const scopeType = String(metadata.scope_type || "resource");
    const permission = String(metadata.permission_key || "access");
    const lastReadAt = stateByWorkspace.get(row.organization_id);
    const isRead = Boolean(lastReadAt && new Date(row.created_at) <= new Date(lastReadAt));
    events.push({
      id: `share:${row.id}`,
      type: "share_granted",
      organizationId: row.organization_id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      title: "New share granted",
      description: `${permission} on ${scopeType}`,
      createdAt: row.created_at,
      isRead,
      href: isSharedBrand ? sharedBrandHref : `/${organization.slug}/settings/team`,
    });
  }

  const updateRecipientRows = (updateRecipients || []) as Array<{
    id: string;
    organization_id: string;
    partner_update_id: string;
    partner_organization_id: string;
    status: string | null;
    first_notified_at: string | null;
    updated_at: string | null;
    created_at: string | null;
  }>;

  const updateIds = Array.from(
    new Set(
      updateRecipientRows
        .map((row) => row.partner_update_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const updateMap = new Map<
    string,
    {
      id: string;
      organization_id: string;
      title: string | null;
      urgency: string | null;
      due_at: string | null;
      published_at: string | null;
    }
  >();
  if (updateIds.length > 0) {
    const { data: updates } = await getSupabaseServer()
      .from("partner_updates")
      .select("id,organization_id,title,urgency,due_at,published_at,status")
      .in("id", updateIds)
      .in("organization_id", filteredOrganizationIds)
      .eq("status", "published");

    for (const row of (updates || []) as Array<{
      id: string;
      organization_id: string;
      title: string | null;
      urgency: string | null;
      due_at: string | null;
      published_at: string | null;
    }>) {
      updateMap.set(row.id, row);
    }
  }

  for (const row of updateRecipientRows) {
    const update = updateMap.get(row.partner_update_id);
    if (!update) continue;
    const organization = organizationsById.get(row.organization_id);
    const membership = membershipsById.get(row.organization_id);
    if (!organization) continue;

    const createdAt =
      row.first_notified_at ||
      update.published_at ||
      row.updated_at ||
      row.created_at ||
      fallbackWindowStart;
    const isSharedBrand =
      membership?.role === "partner" && organization.organizationType === "brand";
    const sharedBrandHref = getSharedBrandHref(
      organization.slug,
      `/updates/${encodeURIComponent(update.id)}`
    );
    const lastReadAt = stateByWorkspace.get(row.organization_id);
    const isRead = Boolean(lastReadAt && new Date(createdAt) <= new Date(lastReadAt));
    const dueSuffix = update.due_at ? ` | Due ${new Date(update.due_at).toLocaleDateString()}` : "";

    events.push({
      id: `update-published:${row.id}`,
      type: "update_published",
      organizationId: row.organization_id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      title: "New update published",
      description: `${update.title || "Untitled update"} | ${update.urgency || "normal"}${dueSuffix}`,
      createdAt,
      isRead,
      href: isSharedBrand
        ? sharedBrandHref
        : `/${organization.slug}/updates/${encodeURIComponent(update.id)}`,
    });
  }

  for (const row of (reminderEvents || []) as Array<{
    id: string;
    organization_id: string;
    partner_update_id: string | null;
    event_at: string | null;
  }>) {
    if (!row.partner_update_id) continue;
    const update = updateMap.get(row.partner_update_id);
    if (!update) continue;
    const organization = organizationsById.get(row.organization_id);
    const membership = membershipsById.get(row.organization_id);
    if (!organization) continue;

    const createdAt = row.event_at || fallbackWindowStart;
    const isSharedBrand =
      membership?.role === "partner" && organization.organizationType === "brand";
    const sharedBrandHref = getSharedBrandHref(
      organization.slug,
      `/updates/${encodeURIComponent(update.id)}`
    );
    const lastReadAt = stateByWorkspace.get(row.organization_id);
    const isRead = Boolean(lastReadAt && new Date(createdAt) <= new Date(lastReadAt));

    events.push({
      id: `update-reminder:${row.id}`,
      type: "update_reminder",
      organizationId: row.organization_id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      title: "Update reminder",
      description: update.title || "Untitled update",
      createdAt,
      isRead,
      href: isSharedBrand
        ? sharedBrandHref
        : `/${organization.slug}/updates/${encodeURIComponent(update.id)}`,
    });
  }

  return events
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, Math.max(1, limit));
}

export async function markWorkspaceNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  organizationIds: string[]
): Promise<void> {
  if (organizationIds.length === 0) return;

  const nowIso = new Date().toISOString();
  const rows = organizationIds.map((organizationId) => ({
    kinde_user_id: userId,
    organization_id: organizationId,
    last_read_at: nowIso,
    updated_at: nowIso,
  }));

  const { error } = await getSupabaseServer()
    .from("user_workspace_notification_state")
    .upsert(rows, { onConflict: "kinde_user_id,organization_id" });

  if (error) {
    throw error;
  }
}
