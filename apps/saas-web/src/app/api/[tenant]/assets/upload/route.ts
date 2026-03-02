import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { requireTenantAccess } from "@/lib/tenant-auth";
import { evaluateScopedPermission } from "@/lib/security-permissions";
import { S3Service } from "@tradetool/storage";
import {
  createGlobalAuthoringScope,
  replaceAssetScopeAssignments,
  validateAuthoringScope,
} from "@/lib/authoring-scope";
import { getOrganizationBillingLimits } from "@/lib/billing-policy";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ProductLinkPayload = {
  productId?: string;
  linkContext?: string;
  confidence?: number;
  matchReason?: string;
  assetType?: string;
  documentSlotCode?: string;
  replaceExistingSlot?: boolean;
  autoOrganize?: boolean;
  targetFolderId?: string | null;
  productFieldId?: string;
  channelId?: string;
  marketId?: string;
  destinationId?: string;
  localeId?: string;
};

type ProductForAssetFolder = {
  id: string;
  scin: string | null;
  sku: string | null;
  product_name: string | null;
  brand_line: string | null;
  family_id: string | null;
};

type UploadProductSelection = {
  all: boolean;
  productIds: string[];
  variantIdsByProduct: Record<string, string[]>;
};

type UploadProfileId = "fast" | "standard" | "compliance";

type UploadAuthoringScope = {
  mode: "global" | "scoped";
  marketIds: string[];
  channelIds: string[];
  localeIds: string[];
  destinationIds: string[];
};

type UploadMetadata = {
  name: string | null;
  description: string | null;
  tags: string[];
  categories: string[];
  keywords: string[];
  usageGroupId: string | null;
  productLinks: UploadProductSelection | null;
  authoringScope: UploadAuthoringScope | null;
  appliesToChildren: boolean;
  autoSuggestedProductLinks: boolean;
  suggestedProductLinkConfidence: number | null;
  suggestedProductLinkReason: string | null;
  folderId: string | null;
  uploadProfileId: UploadProfileId | null;
};

type ProductLinkCandidate = {
  id: string;
  sku: string | null;
  scin: string | null;
  type: string | null;
  parent_id: string | null;
};

type ShareSetDynamicRuleRow = {
  id: string;
  share_set_id: string;
  include_tags: string[] | null;
  include_folder_ids: string[] | null;
  include_usage_group_ids: string[] | null;
  exclude_tags: string[] | null;
  exclude_folder_ids: string[] | null;
};

type DynamicSetMatchSummary = {
  count: number;
  sets: Array<{
    id: string;
    name: string;
    ruleIds: string[];
  }>;
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const DEFAULT_UPLOAD_PROFILE: UploadProfileId = "fast";
const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const FREE_PLAN_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const UPLOAD_PROFILE_REQUIREMENTS: Record<
  UploadProfileId,
  { title: boolean; description: boolean; tags: boolean; productLink: boolean; usageGroup: boolean }
> = {
  fast: {
    title: true,
    description: false,
    tags: false,
    productLink: false,
    usageGroup: false,
  },
  standard: {
    title: true,
    description: false,
    tags: true,
    productLink: true,
    usageGroup: true,
  },
  compliance: {
    title: true,
    description: true,
    tags: true,
    productLink: true,
    usageGroup: true,
  },
};

function sanitizeFolderSegment(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || "")
    .replace(/[\\/]+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 80);
}

async function ensureFolderPath(params: {
  organizationId: string;
  userId: string;
  segments: string[];
}): Promise<string | null> {
  let parentId: string | null = null;
  let currentPath = "";

  for (const rawSegment of params.segments) {
    const segment = sanitizeFolderSegment(rawSegment, "Untitled");
    currentPath = `${currentPath}/${segment}`;

    let query = (supabase as any)
      .from("dam_folders")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("name", segment)
      .limit(1);

    query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);

    const { data: existingFolders } = await query;
    const existing = (existingFolders || [])[0];
    if (existing?.id) {
      parentId = existing.id;
      continue;
    }

    const { data: inserted, error: insertError } = await (supabase as any)
      .from("dam_folders")
      .insert({
        organization_id: params.organizationId,
        name: segment,
        parent_id: parentId,
        path: currentPath,
        created_by: params.userId,
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      return parentId;
    }

    parentId = inserted.id;
  }

  return parentId;
}

function inferMimeTypeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  const extension = Object.keys(EXTENSION_MIME_MAP).find((ext) => lower.endsWith(ext));
  return extension ? EXTENSION_MIME_MAP[extension] : null;
}

function isDocumentMimeType(mimeType: string): boolean {
  const value = String(mimeType || "").toLowerCase();
  return (
    value.includes("pdf") ||
    value.startsWith("text/") ||
    value.includes("msword") ||
    value.includes("officedocument.wordprocessingml") ||
    value.includes("ms-excel") ||
    value.includes("officedocument.spreadsheetml")
  );
}

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalConfidence(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    normalized.add(trimmed);
  }
  return Array.from(normalized);
}

function normalizeUploadProductSelection(value: unknown): UploadProductSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const normalized: UploadProductSelection = {
    all: Boolean(raw.all),
    productIds: normalizeStringArray(raw.productIds),
    variantIdsByProduct: {},
  };

  if (
    raw.variantIdsByProduct &&
    typeof raw.variantIdsByProduct === "object" &&
    !Array.isArray(raw.variantIdsByProduct)
  ) {
    for (const [productId, variantIds] of Object.entries(
      raw.variantIdsByProduct as Record<string, unknown>
    )) {
      const cleanProductId = productId.trim();
      if (!cleanProductId) continue;
      const cleanVariantIds = normalizeStringArray(variantIds);
      if (cleanVariantIds.length > 0) {
        normalized.variantIdsByProduct[cleanProductId] = cleanVariantIds;
      }
    }
  }

  return normalized;
}

function normalizeUploadProfileId(value: unknown): UploadProfileId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "fast" || trimmed === "standard" || trimmed === "compliance") {
    return trimmed as UploadProfileId;
  }
  return null;
}

function normalizeUploadAuthoringScope(value: unknown): UploadAuthoringScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const mode = raw.mode === "scoped" ? "scoped" : "global";
  const scope: UploadAuthoringScope = {
    mode,
    marketIds: normalizeStringArray(raw.marketIds),
    channelIds: normalizeStringArray(raw.channelIds),
    localeIds: normalizeStringArray(raw.localeIds),
    destinationIds: normalizeStringArray(raw.destinationIds),
  };

  if (scope.mode === "global") {
    scope.marketIds = [];
    scope.channelIds = [];
    scope.localeIds = [];
    scope.destinationIds = [];
  }

  return scope;
}

function hasUploadProductSelection(selection: UploadProductSelection | null): boolean {
  if (!selection) return false;
  if (selection.all) return true;
  if (selection.productIds.length > 0) return true;
  return Object.values(selection.variantIdsByProduct).some((variants) => variants.length > 0);
}

function getUploadValidationIssues(params: {
  metadata: UploadMetadata;
  profileId: UploadProfileId;
  productLinkData: ProductLinkPayload | null;
}): string[] {
  const { metadata, profileId, productLinkData } = params;
  const requirements = UPLOAD_PROFILE_REQUIREMENTS[profileId];
  const issues: string[] = [];

  if (requirements.title && !metadata.name?.trim()) {
    issues.push("Missing title");
  }
  if (requirements.description && !metadata.description?.trim()) {
    issues.push("Missing description");
  }
  if (requirements.tags && metadata.tags.length === 0) {
    issues.push("Missing tags");
  }
  if (requirements.usageGroup && !metadata.usageGroupId) {
    issues.push("Missing usage group");
  }
  if (requirements.productLink) {
    const hasLinkedProduct =
      (typeof productLinkData?.productId === "string" && productLinkData.productId.trim().length > 0) ||
      hasUploadProductSelection(metadata.productLinks);
    if (!hasLinkedProduct) {
      issues.push("Missing product link");
    }
  }

  return issues;
}

function parseUploadMetadata(raw: FormDataEntryValue | null): {
  metadata: UploadMetadata | null;
  error: string | null;
} {
  if (!raw) {
    return { metadata: null, error: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return { metadata: null, error: "Invalid metadata payload" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { metadata: null, error: "Invalid metadata payload" };
  }

  const value = parsed as Record<string, unknown>;
  const hasProductLinks = Object.prototype.hasOwnProperty.call(value, "productLinks");
  const hasAuthoringScope = Object.prototype.hasOwnProperty.call(value, "authoringScope");
  const hasUploadProfileId = Object.prototype.hasOwnProperty.call(value, "uploadProfileId");
  const hasAutoSuggestedProductLinks = Object.prototype.hasOwnProperty.call(value, "autoSuggestedProductLinks");
  const hasSuggestedProductLinkConfidence = Object.prototype.hasOwnProperty.call(value, "suggestedProductLinkConfidence");
  const hasSuggestedProductLinkReason = Object.prototype.hasOwnProperty.call(value, "suggestedProductLinkReason");
  const productLinks = hasProductLinks
    ? normalizeUploadProductSelection(value.productLinks)
    : null;
  const authoringScope =
    hasAuthoringScope && value.authoringScope === null
      ? ({
          mode: "global",
          marketIds: [],
          channelIds: [],
          localeIds: [],
          destinationIds: [],
        } as UploadAuthoringScope)
      : hasAuthoringScope
        ? normalizeUploadAuthoringScope(value.authoringScope)
        : null;
  const uploadProfileId = hasUploadProfileId
    ? normalizeUploadProfileId(value.uploadProfileId)
    : null;
  const autoSuggestedProductLinks =
    hasAutoSuggestedProductLinks && typeof value.autoSuggestedProductLinks === "boolean"
      ? value.autoSuggestedProductLinks
      : hasAutoSuggestedProductLinks
        ? null
        : false;
  const suggestedProductLinkConfidence = hasSuggestedProductLinkConfidence
    ? normalizeOptionalConfidence(value.suggestedProductLinkConfidence)
    : null;
  const suggestedProductLinkReason = hasSuggestedProductLinkReason
    ? normalizeOptionalString(value.suggestedProductLinkReason)
    : null;

  if (hasProductLinks && productLinks === null) {
    return { metadata: null, error: "Invalid metadata.productLinks payload" };
  }
  if (hasAuthoringScope && authoringScope === null) {
    return { metadata: null, error: "Invalid metadata.authoringScope payload" };
  }
  if (hasUploadProfileId && uploadProfileId === null) {
    return { metadata: null, error: "Invalid metadata.uploadProfileId payload" };
  }
  if (hasAutoSuggestedProductLinks && autoSuggestedProductLinks === null) {
    return { metadata: null, error: "Invalid metadata.autoSuggestedProductLinks payload" };
  }
  if (
    hasSuggestedProductLinkConfidence &&
    value.suggestedProductLinkConfidence !== null &&
    suggestedProductLinkConfidence === null
  ) {
    return { metadata: null, error: "Invalid metadata.suggestedProductLinkConfidence payload" };
  }
  if (
    hasSuggestedProductLinkReason &&
    value.suggestedProductLinkReason !== null &&
    suggestedProductLinkReason === null
  ) {
    return { metadata: null, error: "Invalid metadata.suggestedProductLinkReason payload" };
  }

  const metadata: UploadMetadata = {
    name: normalizeOptionalString(value.name),
    description: normalizeOptionalString(value.description),
    tags: normalizeStringArray(value.tags),
    categories: normalizeStringArray(value.categories),
    keywords: normalizeStringArray(value.keywords),
    usageGroupId: normalizeOptionalString(value.usageGroupId),
    productLinks,
    authoringScope,
    appliesToChildren:
      typeof value.appliesToChildren === "boolean" ? value.appliesToChildren : true,
    autoSuggestedProductLinks: Boolean(autoSuggestedProductLinks),
    suggestedProductLinkConfidence,
    suggestedProductLinkReason,
    folderId: normalizeOptionalString(value.folderId),
    uploadProfileId,
  };

  return { metadata, error: null };
}

function buildMetadataProductIds(selection: UploadProductSelection): string[] {
  const ids = new Set<string>();
  for (const productId of selection.productIds) {
    ids.add(productId);
  }
  for (const variantIds of Object.values(selection.variantIdsByProduct)) {
    for (const variantId of variantIds) {
      ids.add(variantId);
    }
  }
  return Array.from(ids);
}

function normalizeLowerStringArray(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const cleaned = value.trim().toLowerCase();
    if (!cleaned) continue;
    normalized.add(cleaned);
  }
  return Array.from(normalized);
}

function normalizeStringIdArray(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const cleaned = value.trim();
    if (!cleaned) continue;
    normalized.add(cleaned);
  }
  return Array.from(normalized);
}

function isMissingShareSetRuleFoundation(error: any): boolean {
  const code = String(error?.code || "");
  if (code === "42P01" || code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("share_set_dynamic_rules") ||
    message.includes("share_set_items") ||
    message.includes("share_sets")
  );
}

async function applyDynamicAssetSetRules(params: {
  organizationId: string;
  userId: string;
  assetId: string;
  tags: string[];
  folderId: string | null;
  usageGroupId: string | null;
}): Promise<DynamicSetMatchSummary> {
  const { organizationId, userId, assetId, tags, folderId, usageGroupId } = params;
  const emptySummary: DynamicSetMatchSummary = { count: 0, sets: [] };

  const { data: rules, error: rulesError } = await (supabase as any)
    .from("share_set_dynamic_rules")
    .select(
      "id,share_set_id,include_tags,include_folder_ids,include_usage_group_ids,exclude_tags,exclude_folder_ids"
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (rulesError) {
    if (isMissingShareSetRuleFoundation(rulesError)) {
      return emptySummary;
    }
    throw new Error("Failed to load dynamic share set rules");
  }

  const ruleRows = Array.isArray(rules) ? (rules as ShareSetDynamicRuleRow[]) : [];
  if (ruleRows.length === 0) return emptySummary;

  const tagSet = new Set(normalizeLowerStringArray(tags));
  const normalizedFolderId = folderId ? folderId.trim() : null;
  const normalizedUsageGroup = usageGroupId ? usageGroupId.trim().toLowerCase() : null;
  const matchedRuleIdsBySetId = new Map<string, Set<string>>();

  for (const rule of ruleRows) {
    const includeTags = normalizeLowerStringArray(rule.include_tags);
    const includeFolderIds = normalizeStringIdArray(rule.include_folder_ids);
    const includeUsageGroupIds = normalizeLowerStringArray(rule.include_usage_group_ids);
    const excludeTags = normalizeLowerStringArray(rule.exclude_tags);
    const excludeFolderIds = normalizeStringIdArray(rule.exclude_folder_ids);

    const hasIncludeCriteria =
      includeTags.length > 0 || includeFolderIds.length > 0 || includeUsageGroupIds.length > 0;
    if (!hasIncludeCriteria) {
      continue;
    }

    const includeMatched =
      includeTags.some((tag) => tagSet.has(tag)) ||
      (normalizedFolderId ? includeFolderIds.includes(normalizedFolderId) : false) ||
      (normalizedUsageGroup ? includeUsageGroupIds.includes(normalizedUsageGroup) : false);
    if (!includeMatched) {
      continue;
    }

    const isExcluded =
      excludeTags.some((tag) => tagSet.has(tag)) ||
      (normalizedFolderId ? excludeFolderIds.includes(normalizedFolderId) : false);
    if (isExcluded) {
      continue;
    }

    if (!matchedRuleIdsBySetId.has(rule.share_set_id)) {
      matchedRuleIdsBySetId.set(rule.share_set_id, new Set<string>());
    }
    matchedRuleIdsBySetId.get(rule.share_set_id)!.add(rule.id);
  }

  const matchedSetIds = Array.from(matchedRuleIdsBySetId.keys());
  if (matchedSetIds.length === 0) {
    return emptySummary;
  }

  const itemRows = matchedSetIds.map((setId) => ({
    share_set_id: setId,
    organization_id: organizationId,
    resource_type: "asset",
    resource_id: assetId,
    include_descendants: false,
    market_ids: [],
    channel_ids: [],
    locale_ids: [],
    metadata: {
      source: "dynamic_rule",
      rule_ids: Array.from(matchedRuleIdsBySetId.get(setId) || []),
      applied_at: new Date().toISOString(),
    },
    created_by: userId,
  }));

  const { error: upsertItemsError } = await (supabase as any)
    .from("share_set_items")
    .upsert(itemRows, {
      onConflict: "share_set_id,resource_type,resource_id",
      ignoreDuplicates: true,
    });

  if (upsertItemsError) {
    if (isMissingShareSetRuleFoundation(upsertItemsError)) {
      return emptySummary;
    }
    throw new Error("Failed to apply dynamic share set items");
  }

  const { data: matchedSets, error: matchedSetsError } = await (supabase as any)
    .from("share_sets")
    .select("id,name")
    .eq("organization_id", organizationId)
    .eq("module_key", "assets")
    .in("id", matchedSetIds);

  if (matchedSetsError) {
    if (isMissingShareSetRuleFoundation(matchedSetsError)) {
      return emptySummary;
    }
    throw new Error("Failed to resolve matched share sets");
  }

  const setNameById = new Map<string, string>();
  for (const row of (matchedSets || []) as Array<{ id: string; name: string | null }>) {
    if (row.id) {
      setNameById.set(row.id, row.name?.trim() || row.id);
    }
  }

  return {
    count: matchedSetIds.length,
    sets: matchedSetIds.map((setId) => ({
      id: setId,
      name: setNameById.get(setId) || setId,
      ruleIds: Array.from(matchedRuleIdsBySetId.get(setId) || []),
    })),
  };
}

// POST /api/[tenant]/assets/upload
// Hardened legacy upload endpoint with tenant + scoped permission checks.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantSlug = resolvedParams.tenant;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenantSlug, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const tenantAccess = await requireTenantAccess(request, tenantSlug);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await getOrganizationBillingLimits(organization.id);
    const maxUploadBytes =
      planId === "free" ? FREE_PLAN_MAX_UPLOAD_BYTES : DEFAULT_MAX_UPLOAD_BYTES;

    const db = new DatabaseQueries(supabase as any);
    const authService = new AuthService(db);
    const canUpload = await evaluateScopedPermission({
      authService,
      userId,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetUpload,
    });

    if (!canUpload) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to upload assets." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const metadataRaw = formData.get("metadata");
    const productLinkRaw = formData.get("productLink");
    const metadataParseResult = parseUploadMetadata(metadataRaw);
    if (metadataParseResult.error) {
      return NextResponse.json({ error: metadataParseResult.error }, { status: 400 });
    }
    const uploadMetadata = metadataParseResult.metadata;
    const requestedAuthoringScope =
      uploadMetadata?.authoringScope ?? createGlobalAuthoringScope();
    const authoringScopeValidation = await validateAuthoringScope({
      supabase,
      organizationId: organization.id,
      rawScope: requestedAuthoringScope,
    });
    if (!authoringScopeValidation.ok) {
      return NextResponse.json({ error: authoringScopeValidation.error }, { status: authoringScopeValidation.status });
    }
    const normalizedAuthoringScope = authoringScopeValidation.scope;
    let productLinkData: ProductLinkPayload | null = null;
    if (productLinkRaw) {
      try {
        productLinkData = JSON.parse(String(productLinkRaw)) as ProductLinkPayload;
      } catch {
        return NextResponse.json({ error: "Invalid productLink payload" }, { status: 400 });
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (uploadMetadata) {
      const effectiveProfileId = uploadMetadata.uploadProfileId ?? DEFAULT_UPLOAD_PROFILE;
      const validationIssues = getUploadValidationIssues({
        metadata: uploadMetadata,
        profileId: effectiveProfileId,
        productLinkData,
      });

      if (validationIssues.length > 0) {
        return NextResponse.json(
          {
            error: `Upload metadata incomplete for profile '${effectiveProfileId}'`,
            uploadProfileId: effectiveProfileId,
            validationIssues,
          },
          { status: 400 }
        );
      }
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/avif",
      "image/tiff",
      "image/bmp",
      "image/heic",
      "image/heif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    const inferredMimeType = inferMimeTypeFromFilename(file.name);
    const providedMimeType = String(file.type || "").trim().toLowerCase();
    const effectiveMimeType = allowedTypes.includes(providedMimeType)
      ? providedMimeType
      : inferredMimeType || providedMimeType;

    if (!effectiveMimeType || !allowedTypes.includes(effectiveMimeType)) {
      return NextResponse.json(
        { error: `File type ${file.type || inferredMimeType || "unknown"} is not allowed` },
        { status: 400 }
      );
    }

    if (file.size > maxUploadBytes) {
      return NextResponse.json(
        {
          error: `File size exceeds your plan limit of ${Math.floor(
            maxUploadBytes / (1024 * 1024)
          )}MB`,
          code: "FILE_SIZE_LIMIT_EXCEEDED",
          limitBytes: maxUploadBytes,
        },
        { status: 400 }
      );
    }

    const s3Service = new S3Service();
    const s3Key = s3Service.generateAssetKey(organization.id, file.name);

    try {
      const fileBuffer = await file.arrayBuffer();
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || "ap-southeast-2",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
          Body: Buffer.from(fileBuffer),
          ContentType: effectiveMimeType,
        })
      );
    } catch (s3Error) {
      console.error("POST /assets/upload S3 upload failed:", s3Error);
      return NextResponse.json(
        { error: "Failed to upload file to storage" },
        { status: 500 }
      );
    }

    let assetType = "other";
    if (effectiveMimeType.startsWith("image/")) assetType = "image";
    else if (effectiveMimeType.startsWith("video/")) assetType = "video";
    else if (isDocumentMimeType(effectiveMimeType)) assetType = "document";

    const publicUrl = s3Service.getPublicUrl(s3Key);

    let linkedProduct: ProductForAssetFolder | null = null;
    let linkedFamilyName: string | null = null;
    let resolvedFolderId: string | null = null;
    let metadataLinkedProducts: ProductLinkCandidate[] = [];
    const productIdentifiers = new Set<string>();

    if (productLinkData?.productId) {
      const { data: productRow } = await (supabase as any)
        .from("products")
        .select("id,scin,sku,product_name,brand_line,family_id")
        .eq("organization_id", organization.id)
        .eq("id", productLinkData.productId)
        .maybeSingle();

      if (productRow) {
        linkedProduct = productRow as ProductForAssetFolder;
        if (linkedProduct.scin && linkedProduct.scin.trim()) {
          productIdentifiers.add(linkedProduct.scin.trim());
        }
        if (linkedProduct.sku && linkedProduct.sku.trim()) {
          productIdentifiers.add(linkedProduct.sku.trim());
        }
        if (linkedProduct.family_id) {
          const { data: familyRow } = await (supabase as any)
            .from("product_families")
            .select("name")
            .eq("organization_id", organization.id)
            .eq("id", linkedProduct.family_id)
            .maybeSingle();
          linkedFamilyName = (familyRow?.name as string | undefined) || null;
        }
      }
    }

    const explicitTargetFolderId =
      typeof productLinkData?.targetFolderId === "string" &&
      productLinkData.targetFolderId.trim().length > 0
        ? productLinkData.targetFolderId.trim()
        : null;
    const metadataFolderId =
      typeof uploadMetadata?.folderId === "string" && uploadMetadata.folderId.trim().length > 0
        ? uploadMetadata.folderId.trim()
        : null;

    if (explicitTargetFolderId) {
      const { data: explicitFolder } = await (supabase as any)
        .from("dam_folders")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("id", explicitTargetFolderId)
        .maybeSingle();
      if (explicitFolder?.id) {
        resolvedFolderId = explicitFolder.id;
      }
    }

    if (!resolvedFolderId && metadataFolderId) {
      const { data: metadataFolder } = await (supabase as any)
        .from("dam_folders")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("id", metadataFolderId)
        .maybeSingle();
      if (metadataFolder?.id) {
        resolvedFolderId = metadataFolder.id;
      }
    }

    if (!resolvedFolderId && productLinkData?.autoOrganize && linkedProduct) {
      const productLabel = sanitizeFolderSegment(linkedProduct.product_name, "Product");
      const scinLabel = sanitizeFolderSegment(linkedProduct.scin || linkedProduct.id, "Unknown");
      const productFolderName = `${productLabel} (${scinLabel})`;
      const segments = [
        "Product Assets",
        sanitizeFolderSegment(linkedProduct.brand_line, "Unbranded"),
      ];
      if (linkedFamilyName) {
        segments.push(sanitizeFolderSegment(linkedFamilyName, "General"));
      }
      segments.push(productFolderName);

      resolvedFolderId = await ensureFolderPath({
        organizationId: organization.id,
        userId,
        segments,
      });
    }

    if (uploadMetadata?.productLinks && !productLinkData?.productId) {
      const selection = uploadMetadata.productLinks;
      if (selection.all) {
        const { data: allProducts, error: allProductsError } = await (supabase as any)
          .from("products")
          .select("id,sku,scin,type,parent_id")
          .eq("organization_id", organization.id)
          .eq("status", "Active");
        if (!allProductsError && Array.isArray(allProducts)) {
          metadataLinkedProducts = allProducts as ProductLinkCandidate[];
        }
      } else {
        const explicitProductIds = buildMetadataProductIds(selection);
        if (explicitProductIds.length > 0) {
          const { data: selectedProducts, error: selectedProductsError } = await (supabase as any)
            .from("products")
            .select("id,sku,scin,type,parent_id")
            .eq("organization_id", organization.id)
            .in("id", explicitProductIds);
          if (!selectedProductsError && Array.isArray(selectedProducts)) {
            metadataLinkedProducts = selectedProducts as ProductLinkCandidate[];
          }
        }

        if (uploadMetadata.appliesToChildren) {
          const parentIds = Array.from(
            new Set(
              metadataLinkedProducts
                .filter((product) => String(product.type || "").toLowerCase() !== "variant")
                .map((product) => product.id)
            )
          );

          if (parentIds.length > 0) {
            const { data: descendantVariants, error: descendantError } = await (supabase as any)
              .from("products")
              .select("id,sku,scin,type,parent_id")
              .eq("organization_id", organization.id)
              .in("parent_id", parentIds);
            if (!descendantError && Array.isArray(descendantVariants)) {
              const seenIds = new Set(metadataLinkedProducts.map((product) => product.id));
              for (const variant of descendantVariants as ProductLinkCandidate[]) {
                if (!seenIds.has(variant.id)) {
                  metadataLinkedProducts.push(variant);
                  seenIds.add(variant.id);
                }
              }
            }
          }
        }
      }
    }

    for (const product of metadataLinkedProducts) {
      if (product.scin && product.scin.trim()) {
        productIdentifiers.add(product.scin.trim());
      }
      if (product.sku && product.sku.trim()) {
        productIdentifiers.add(product.sku.trim());
      }
    }

    const metadataPayload =
      uploadMetadata !== null
        ? {
            usageGroupId: uploadMetadata.usageGroupId,
            categories: uploadMetadata.categories,
            keywords: uploadMetadata.keywords,
            productLinks: uploadMetadata.productLinks,
            authoringScope: normalizedAuthoringScope,
            appliesToChildren: uploadMetadata.appliesToChildren,
            autoSuggestedProductLinks: uploadMetadata.autoSuggestedProductLinks,
            suggestedProductLinkConfidence: uploadMetadata.suggestedProductLinkConfidence,
            suggestedProductLinkReason: uploadMetadata.suggestedProductLinkReason,
            uploadProfileId: uploadMetadata.uploadProfileId ?? DEFAULT_UPLOAD_PROFILE,
          }
        : { authoringScope: normalizedAuthoringScope };
    const filename = uploadMetadata?.name || file.name;
    const description = uploadMetadata?.description || null;

    const { data: createdAsset, error: assetError } = await (supabase as any)
      .from("dam_assets")
      .insert({
        organization_id: organization.id,
        folder_id: resolvedFolderId,
        filename,
        original_filename: file.name,
        file_type: assetType,
        file_size: file.size,
        mime_type: effectiveMimeType,
        s3_key: s3Key,
        s3_url: publicUrl,
        product_identifiers: Array.from(productIdentifiers),
        metadata: metadataPayload,
        tags: uploadMetadata?.tags || [],
        description,
        created_by: userId,
      })
      .select()
      .single();

    if (assetError) {
      console.error("POST /assets/upload DB insert failed:", assetError);
      return NextResponse.json({ error: "Failed to save asset" }, { status: 500 });
    }

    const scopeAssignmentResult = await replaceAssetScopeAssignments({
      supabase,
      organizationId: organization.id,
      assetId: createdAsset.id,
      rawScope: normalizedAuthoringScope,
      source: "upload",
      userId,
      metadata: { source: "upload" },
    });

    if (!scopeAssignmentResult.ok) {
      console.error("POST /assets/upload scope assignment failed:", scopeAssignmentResult.error);
      await (supabase as any)
        .from("dam_assets")
        .delete()
        .eq("organization_id", organization.id)
        .eq("id", createdAsset.id);

      return NextResponse.json({ error: scopeAssignmentResult.error }, { status: scopeAssignmentResult.status });
    }

    if (productLinkData?.productId) {
      const cleanDocumentSlotCode =
        typeof productLinkData.documentSlotCode === "string" &&
        productLinkData.documentSlotCode.trim().length > 0
          ? productLinkData.documentSlotCode.trim()
          : null;

      if (cleanDocumentSlotCode && productLinkData.replaceExistingSlot !== false) {
        let replaceQuery = (supabase as any)
          .from("product_asset_links")
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", organization.id)
          .eq("product_id", productLinkData.productId)
          .eq("document_slot_code", cleanDocumentSlotCode)
          .eq("is_active", true);

        const scopedChannelId =
          typeof productLinkData.channelId === "string" && productLinkData.channelId.trim()
            ? productLinkData.channelId.trim()
            : null;
        const scopedMarketId =
          typeof productLinkData.marketId === "string" && productLinkData.marketId.trim()
            ? productLinkData.marketId.trim()
            : null;
        const scopedDestinationId =
          typeof productLinkData.destinationId === "string" && productLinkData.destinationId.trim()
            ? productLinkData.destinationId.trim()
            : null;
        const scopedLocaleId =
          typeof productLinkData.localeId === "string" && productLinkData.localeId.trim()
            ? productLinkData.localeId.trim()
            : null;

        replaceQuery = scopedChannelId
          ? replaceQuery.eq("channel_id", scopedChannelId)
          : replaceQuery.is("channel_id", null);
        replaceQuery = scopedMarketId
          ? replaceQuery.eq("market_id", scopedMarketId)
          : replaceQuery.is("market_id", null);
        replaceQuery = scopedDestinationId
          ? replaceQuery.eq("destination_id", scopedDestinationId)
          : replaceQuery.is("destination_id", null);
        replaceQuery = scopedLocaleId
          ? replaceQuery.eq("locale_id", scopedLocaleId)
          : replaceQuery.is("locale_id", null);

        const { error: replaceError } = await replaceQuery;
        if (replaceError) {
          console.error("POST /assets/upload slot replacement failed:", replaceError);
        }
      }

      const linkInsertPayload: Record<string, any> = {
        organization_id: organization.id,
        product_id: productLinkData.productId,
        asset_id: createdAsset.id,
        asset_type: productLinkData.assetType || assetType,
        link_context: productLinkData.linkContext || "upload",
        confidence: productLinkData.confidence || 0.8,
        match_reason: productLinkData.matchReason || "Manual linking during upload",
        link_type: "manual",
        created_by: userId,
      };

      if (cleanDocumentSlotCode) {
        linkInsertPayload.document_slot_code = cleanDocumentSlotCode;
      }
      if (typeof productLinkData.productFieldId === "string" && productLinkData.productFieldId.trim()) {
        linkInsertPayload.product_field_id = productLinkData.productFieldId.trim();
      }
      if (typeof productLinkData.channelId === "string" && productLinkData.channelId.trim()) {
        linkInsertPayload.channel_id = productLinkData.channelId.trim();
      }
      if (typeof productLinkData.marketId === "string" && productLinkData.marketId.trim()) {
        linkInsertPayload.market_id = productLinkData.marketId.trim();
      }
      if (typeof productLinkData.destinationId === "string" && productLinkData.destinationId.trim()) {
        linkInsertPayload.destination_id = productLinkData.destinationId.trim();
      }
      if (typeof productLinkData.localeId === "string" && productLinkData.localeId.trim()) {
        linkInsertPayload.locale_id = productLinkData.localeId.trim();
      }

      const { error: linkError } = await (supabase as any)
        .from("product_asset_links")
        .insert(linkInsertPayload);

      if (linkError) {
        console.error("POST /assets/upload product link failed:", linkError);
      }
    }

    if (!productLinkData?.productId && metadataLinkedProducts.length > 0) {
      const rowsByProductId = new Map<string, ProductLinkCandidate>();
      for (const product of metadataLinkedProducts) {
        rowsByProductId.set(product.id, product);
      }

      const metadataLinkRows = Array.from(rowsByProductId.keys()).map((productId) => ({
        organization_id: organization.id,
        product_id: productId,
        asset_id: createdAsset.id,
        asset_type: assetType,
        link_context: "upload",
        confidence:
          uploadMetadata?.autoSuggestedProductLinks &&
          typeof uploadMetadata.suggestedProductLinkConfidence === "number" &&
          uploadMetadata.productLinks?.all !== true
            ? uploadMetadata.suggestedProductLinkConfidence
            : 1,
        match_reason:
          uploadMetadata?.productLinks?.all === true
            ? "Linked to all products during upload"
            : uploadMetadata?.autoSuggestedProductLinks
              ? uploadMetadata.suggestedProductLinkReason || "Auto-suggested from filename metadata"
              : "Linked from upload metadata",
        link_type: uploadMetadata?.autoSuggestedProductLinks ? "auto" : "manual",
        is_active: true,
        created_by: userId,
      }));

      if (metadataLinkRows.length > 0) {
        const { error: metadataLinksError } = await (supabase as any)
          .from("product_asset_links")
          .upsert(metadataLinkRows, {
            onConflict: "organization_id,product_id,asset_id,link_context",
          });

        if (metadataLinksError) {
          console.error("POST /assets/upload metadata product links failed:", metadataLinksError);
        }
      }
    }

    let dynamicSetMatches: DynamicSetMatchSummary = { count: 0, sets: [] };
    try {
      dynamicSetMatches = await applyDynamicAssetSetRules({
        organizationId: organization.id,
        userId,
        assetId: createdAsset.id,
        tags: uploadMetadata?.tags || [],
        folderId: resolvedFolderId,
        usageGroupId: uploadMetadata?.usageGroupId || null,
      });
    } catch (dynamicRulesError) {
      console.error("POST /assets/upload dynamic set rule application failed:", dynamicRulesError);
    }

    return NextResponse.json({
      data: createdAsset,
      message: "Asset uploaded successfully",
      meta: {
        dynamicSetMatches,
      },
    });
  } catch (error) {
    console.error("POST /assets/upload failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
