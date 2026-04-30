export type PublishedProfileSummary = {
  id: string;
  name: string;
  code: string;
  profileType: string;
  isPrimary: boolean;
};

export type PublishedWorkspaceBrand = {
  id: string;
  slug: string;
  name: string;
  relationship: "self" | "shared";
  profiles: PublishedProfileSummary[];
  latest_publish_at: string | null;
};

export type PublishedWorkspaceResponse = {
  workspace: {
    id: string;
    slug: string;
    name: string;
    organization_type: string;
  };
  brands: PublishedWorkspaceBrand[];
};

export type PublishedCatalogProduct = {
  id: string;
  scin: string | null;
  sku: string | null;
  product_name: string | null;
  status: string | null;
  updated_at: string | null;
  primary_image_url: string | null;
  brand: string;
  profile: string | null;
  profile_id?: string | null;
  locale: string | null;
  market: string | null;
  destination: string | null;
  published_at: string | null;
  publish_version: string;
};

export type PublishedCatalogResponse = {
  brand: {
    id: string;
    slug: string;
    name: string;
  };
  profile: string | null;
  profile_id?: string | null;
  locale: string | null;
  market: string | null;
  destination: string | null;
  published_at: string | null;
  publish_version: string;
  products: PublishedCatalogProduct[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total_count?: number;
    has_more: boolean;
  };
};

export type PublishedAsset = {
  id: string;
  filename: string | null;
  original_filename: string | null;
  file_type: string | null;
  mime_type: string | null;
  file_size: number | null;
  folder_id: string | null;
  description: string | null;
  alt_text: string | null;
  tags: string[];
  product_identifiers: string[];
  asset_scope: string | null;
  asset_status: string | null;
  updated_at: string | null;
  current_version_changed_at: string | null;
  brand: string;
  profile: string | null;
  profile_id?: string | null;
  locale: string | null;
  market: string | null;
  destination: string | null;
  published_at: string | null;
  publish_version: string;
  delivery: {
    original_url: string | null;
    thumbnail_urls: Record<string, unknown> | null;
  };
};

export type PublishedAssetsResponse = {
  brand: {
    id: string;
    slug: string;
    name: string;
  };
  profile: string | null;
  profile_id?: string | null;
  locale: string | null;
  market: string | null;
  destination: string | null;
  published_at: string | null;
  publish_version: string;
  assets: PublishedAsset[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total_count?: number;
    has_more: boolean;
  };
};

export type PublishedProductResponse = {
  brand: {
    id: string;
    slug: string;
    name: string;
  };
  product: {
    id: string;
    scin: string | null;
    sku: string | null;
    product_name: string | null;
    status: string | null;
    family_id: string | null;
    brand: string;
    profile: string | null;
    profile_id?: string | null;
    locale: string | null;
    market: string | null;
    destination: string | null;
    published_at: string | null;
    publish_version: string;
    base_fields: Record<string, unknown>;
    output_fields: Record<string, unknown>;
    attributes: Record<string, unknown>;
    asset_slots: PublishedAsset[];
    partner_documents: unknown[];
    missing_requirements: unknown[];
  };
};

export type PublishedUpdate = {
  id: string;
  profile: string | null;
  output_profile_id: string | null;
  market_id: string | null;
  locale_id: string | null;
  destination: string | null;
  published_at: string | null;
  publish_state: string;
  publish_version: string;
  readiness_snapshot: Record<string, unknown> | null;
};

export type PublishedUpdatesResponse = {
  brand: {
    id: string;
    slug: string;
    name: string;
  };
  updates: PublishedUpdate[];
};

export type PublishedPublishResponse = {
  brand: {
    id: string;
    slug: string;
    name: string;
  };
  publish: {
    id: string;
    profile: string | null;
    output_profile_id: string | null;
    market_id: string | null;
    locale_id: string | null;
    destination: string | null;
    publish_state: string;
    published_at: string | null;
    publish_version: string;
    readiness_snapshot: Record<string, unknown> | null;
    scope_metadata: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
  };
};

export function buildPublishedQuery(params: {
  profile?: string | null;
  locale?: string | null;
  market?: string | null;
  destination?: string | null;
  updatedSince?: string | null;
  limit?: number | null;
  offset?: number | null;
}) {
  const query = new URLSearchParams();
  if (params.profile) query.set("profile", params.profile);
  if (params.locale) query.set("locale", params.locale);
  if (params.market) query.set("market", params.market);
  if (params.destination) query.set("destination", params.destination);
  if (params.updatedSince) query.set("updated_since", params.updatedSince);
  if (typeof params.limit === "number") query.set("limit", String(params.limit));
  if (typeof params.offset === "number") query.set("offset", String(params.offset));
  return query.toString();
}

export function formatPublishedDate(value: string | null) {
  if (!value) return "Not published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not published";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatPublishedDateTime(value: string | null) {
  if (!value) return "Not published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not published";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

