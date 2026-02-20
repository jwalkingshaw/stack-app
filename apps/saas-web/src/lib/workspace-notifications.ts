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
    storageUsed: number;
    storageLimit: number;
  };
}

export interface WorkspaceNotificationEvent {
  id: string;
  type: "asset_added" | "product_added" | "share_granted";
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  title: string;
  description: string;
  createdAt: string;
  isRead: boolean;
  href: string;
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
  supabase: any,
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
      organization:organizations (
        id,
        name,
        slug,
        organization_type,
        partner_category,
        storage_used,
        storage_limit
      )
    `;

  const { data, error } = await supabase
    .from("organization_members")
    .select(membershipSelect)
    .eq("kinde_user_id", userId)
    .eq("status", "active");

  if (error || !data) {
    throw error || new Error("Failed to load workspace memberships");
  }

  const rowsById = new Map<string, any>();
  for (const row of data as any[]) {
    if (row?.id) rowsById.set(row.id, row);
  }

  const includeEmailLookup = options?.includeEmailLookup ?? true;
  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (includeEmailLookup && normalizedEmail.length > 0) {
    const { data: emailData, error: emailError } = await supabase
      .from("organization_members")
      .select(membershipSelect)
      .ilike("email", normalizedEmail)
      .eq("status", "active");

    if (emailError) {
      throw emailError;
    }

    const relinkIds: string[] = [];
    for (const row of (emailData || []) as any[]) {
      if (row?.id) {
        rowsById.set(row.id, row);
        if (row.kinde_user_id !== userId) {
          relinkIds.push(row.id);
        }
      }
    }

    if (relinkIds.length > 0) {
      await supabase
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
      if (!organization?.id || !organization?.slug) return null;
      return {
        memberId: membership.id,
        role: membership.role,
        createdAt: membership.created_at ?? null,
        lastAccessedAt: membership.last_accessed_at ?? null,
        organization: {
          id: organization.id,
          name: organization.name ?? organization.slug,
          slug: organization.slug,
          organizationType: organization.organization_type ?? "brand",
          partnerCategory: organization.partner_category ?? null,
          storageUsed: organization.storage_used ?? 0,
          storageLimit: organization.storage_limit ?? 1073741824,
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
  const { data: partnerRowsV2, error: partnerRowsV2Error } = await supabase
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
    partnerRows = (partnerRowsV2 as Array<any>)
      .filter((row) => row?.brand_organization_id)
      .map((row) => ({
        id: String(row.id),
        created_at: row.created_at ?? null,
        brand_id: String(row.brand_organization_id),
      }));
  } else {
    // Fallback path: legacy schema variants used brand_id/partner_id columns.
    const { data: partnerRowsV1, error: partnerRowsV1Error } = await supabase
      .from("brand_partner_relationships")
      .select("id, created_at, brand_id")
      .in("partner_id", partnerOrganizationIds)
      .eq("status", "active");

    if (!partnerRowsV1Error && Array.isArray(partnerRowsV1)) {
      partnerRows = (partnerRowsV1 as Array<any>)
        .filter((row) => row?.brand_id)
        .map((row) => ({
          id: String(row.id),
          created_at: row.created_at ?? null,
          brand_id: String(row.brand_id),
        }));
    }
  }

  if (partnerRows.length === 0) {
    return directMemberships;
  }

  const brandIds = Array.from(new Set(partnerRows.map((row) => row.brand_id)));
  const { data: brands, error: brandsError } = await supabase
    .from("organizations")
    .select("id, name, slug, organization_type, partner_category, storage_used, storage_limit")
    .in("id", brandIds);

  if (brandsError || !Array.isArray(brands)) {
    return directMemberships;
  }

  const brandsById = new Map<string, any>();
  for (const brand of brands as Array<any>) {
    if (brand?.id) {
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
    if (merged.has(brand.id)) continue;

    merged.set(brand.id, {
      memberId: `partner:${String(row.id)}`,
      role: "partner",
      createdAt: row.created_at ?? null,
      lastAccessedAt: null,
      organization: {
        id: String(brand.id),
        name: brand.name ?? brand.slug,
        slug: brand.slug,
        organizationType: brand.organization_type ?? "brand",
        partnerCategory: brand.partner_category ?? null,
        storageUsed: brand.storage_used ?? 0,
        storageLimit: brand.storage_limit ?? 1073741824,
      },
    });
  }

  return Array.from(merged.values());
}

export async function getWorkspaceNotificationStateMap(
  supabase: any,
  userId: string,
  organizationIds: string[]
): Promise<Map<string, string>> {
  const stateByWorkspace = new Map<string, string>();

  if (organizationIds.length === 0) {
    return stateByWorkspace;
  }

  const { data, error } = await supabase
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

  for (const row of (data || []) as Array<{ organization_id: string; last_read_at: string }>) {
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
  supabase: any,
  memberships: WorkspaceMembership[],
  stateByWorkspace: Map<string, string>
): Promise<Map<string, number>> {
  const unreadByWorkspace = new Map<string, number>();
  const fallbackWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  await Promise.all(
    memberships.map(async (membership) => {
      const organizationId = membership.organization.id;
      const lastReadAt = stateByWorkspace.get(organizationId);
      const baseline = lastReadAt || membership.lastAccessedAt;
      const sinceIso = toIsoOrFallback(baseline, fallbackWindowStart);

      const [{ count: assetCount }, { count: productCount }, { count: shareCount }] =
        await Promise.all([
          supabase
            .from("dam_assets")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .gt("created_at", sinceIso),
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .gt("created_at", sinceIso),
          supabase
            .from("security_audit_logs")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("action", "container.share.granted")
            .gt("created_at", sinceIso),
        ]);

      unreadByWorkspace.set(
        organizationId,
        (assetCount ?? 0) + (productCount ?? 0) + (shareCount ?? 0)
      );
    })
  );

  return unreadByWorkspace;
}

export async function getWorkspaceNotificationEvents(
  supabase: any,
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

  const [{ data: assets }, { data: products }, { data: shares }] = await Promise.all([
    supabase
      .from("dam_assets")
      .select("id,organization_id,filename,created_at")
      .in("organization_id", filteredOrganizationIds)
      .gte("created_at", fallbackWindowStart)
      .order("created_at", { ascending: false })
      .limit(queryLimit),
    supabase
      .from("products")
      .select("id,organization_id,product_name,sku,created_at")
      .in("organization_id", filteredOrganizationIds)
      .gte("created_at", fallbackWindowStart)
      .order("created_at", { ascending: false })
      .limit(queryLimit),
    supabase
      .from("security_audit_logs")
      .select("id,organization_id,action,metadata,created_at")
      .in("organization_id", filteredOrganizationIds)
      .eq("action", "container.share.granted")
      .gte("created_at", fallbackWindowStart)
      .order("created_at", { ascending: false })
      .limit(queryLimit),
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

  return events
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, Math.max(1, limit));
}

export async function markWorkspaceNotificationsRead(
  supabase: any,
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

  const { error } = await supabase
    .from("user_workspace_notification_state")
    .upsert(rows, { onConflict: "kinde_user_id,organization_id" });

  if (error) {
    throw error;
  }
}
