import crypto from "node:crypto";
import Link from "next/link";
import { headers } from "next/headers";
import type { Json } from "@tradetool/database";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type SharedUpdate = {
  organizationId: string;
  updateId: string;
  brandName: string | null;
  title: string;
  summary: string | null;
  urgency: string;
  status: string;
  dueAt: string | null;
  publishedAt: string | null;
  messageJson: Record<string, unknown>;
  publicEnabled: boolean;
  expiresAt: string;
  kitItems: Array<{
    id: string;
    itemType: string;
    title: string | null;
    description: string | null;
    url: string | null;
    productId: string | null;
    assetId: string | null;
    contentJson: Record<string, unknown>;
  }>;
  productLookup: Record<string, { name: string | null; sku: string | null; type: string | null }>;
  assetLookup: Record<string, { filename: string | null; fileType: string | null }>;
  publicAssetTokens: Record<string, string>;
};

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now();
}

function parseMessageBodyHtml(messageJson: Record<string, unknown>): string | null {
  const bodyHtml = messageJson.body_html;
  if (typeof bodyHtml === "string" && bodyHtml.trim()) return bodyHtml;
  return null;
}

function parseMessageBlocks(messageJson: Record<string, unknown>): string[] {
  const blocks = (messageJson as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const text = typeof row.text === "string" ? row.text.trim() : "";
      return text || null;
    })
    .filter((value): value is string => Boolean(value));
}

function extractTextContent(contentJson: Record<string, unknown>): string | null {
  const text = contentJson.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  const body = contentJson.body;
  if (typeof body === "string" && body.trim()) return body.trim();
  const value = contentJson.value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function buildViewerKey(input: {
  ip: string | null;
  userAgent: string | null;
  acceptLanguage: string | null;
}): string | null {
  const seed = [input.ip || "", input.userAgent || "", input.acceptLanguage || ""]
    .map((value) => value.trim())
    .join("|");
  if (!seed.replace(/\|/g, "")) return null;
  return crypto.createHash("sha256").update(seed).digest("hex");
}

async function trackPublicShareOpen(params: {
  organizationId: string;
  updateId: string;
  tenant: string;
  token: string;
}) {
  try {
    const headerStore = await headers();
    const forwardedFor = headerStore.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() || null : null;
    const userAgent = headerStore.get("user-agent");
    const acceptLanguage = headerStore.get("accept-language");
    const viewerKey = buildViewerKey({ ip, userAgent, acceptLanguage });

    const metadata: Record<string, unknown> = {
      source: "public_share_page",
      tenant: params.tenant,
      tokenPrefix: params.token.slice(0, 8),
      viewerKey,
    };

    const { error } = await (supabaseServer).from("partner_update_activity").insert({
      organization_id: params.organizationId,
      partner_update_id: params.updateId,
      partner_organization_id: null,
      actor_user_id: null,
      event_type: "public_share_opened",
      event_at: new Date().toISOString(),
      metadata: metadata as Json,
    });

    if (error) {
      console.error("Failed to record public share open:", error);
    }
  } catch (error) {
    console.error("Failed to track public share open:", error);
  }
}

async function findSharedUpdate(params: {
  tenant: string;
  token: string;
}): Promise<SharedUpdate | null> {
  const db = new DatabaseQueries(supabaseServer);
  const org = await db.getOrganizationBySlug(params.tenant);
  if (!org) return null;

  const { data: shareRow } = await (supabaseServer)
    .from("partner_update_shares")
    .select("partner_update_id,public_enabled,expires_at")
    .eq("organization_id", org.id)
    .eq("token", params.token)
    .maybeSingle();
  if (!shareRow) return null;
  const shareRecord = asRecord(shareRow);
  if (!shareRecord) return null;

  const updateId = String(shareRecord.partner_update_id || "");
  if (!updateId) return null;

  const { data: updateRow } = await (supabaseServer)
    .from("partner_updates")
    .select("id,title,summary,urgency,status,due_at,published_at,message_json")
    .eq("organization_id", org.id)
    .eq("id", updateId)
    .maybeSingle();
  if (!updateRow) return null;
  const updateRecord = asRecord(updateRow);
  if (!updateRecord) return null;

  const { data: kitRows } = await (supabaseServer)
    .from("partner_update_kit_items")
    .select("id,item_type,title,description,url,product_id,asset_id,content_json,sort_order,created_at")
    .eq("organization_id", org.id)
    .eq("partner_update_id", updateId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const items = ((kitRows || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id || ""),
    itemType: String(row.item_type || ""),
    title: typeof row.title === "string" ? row.title : null,
    description: typeof row.description === "string" ? row.description : null,
    url: typeof row.url === "string" ? row.url : null,
    productId: typeof row.product_id === "string" ? row.product_id : null,
    assetId: typeof row.asset_id === "string" ? row.asset_id : null,
    contentJson:
      row.content_json && typeof row.content_json === "object" && !Array.isArray(row.content_json)
        ? (row.content_json as Record<string, unknown>)
        : {},
  }));

  const productIds = Array.from(
    new Set(items.map((item) => item.productId).filter((id): id is string => Boolean(id)))
  );
  const assetIds = Array.from(
    new Set(items.map((item) => item.assetId).filter((id): id is string => Boolean(id)))
  );

  const productLookup: Record<string, { name: string | null; sku: string | null; type: string | null }> = {};
  if (productIds.length > 0) {
    const { data: productRows } = await (supabaseServer)
      .from("products")
      .select("id,product_name,sku,type")
      .eq("organization_id", org.id)
      .in("id", productIds);
    for (const row of (productRows || []) as Array<Record<string, unknown>>) {
      const id = String(row.id || "");
      if (!id) continue;
      productLookup[id] = {
        name: typeof row.product_name === "string" ? row.product_name : null,
        sku: typeof row.sku === "string" ? row.sku : null,
        type: typeof row.type === "string" ? row.type : null,
      };
    }
  }

  const assetLookup: Record<string, { filename: string | null; fileType: string | null }> = {};
  if (assetIds.length > 0) {
    const { data: assetRows } = await (supabaseServer)
      .from("dam_assets")
      .select("id,original_filename,file_type")
      .eq("organization_id", org.id)
      .in("id", assetIds);
    for (const row of (assetRows || []) as Array<Record<string, unknown>>) {
      const id = String(row.id || "");
      if (!id) continue;
      assetLookup[id] = {
        filename: typeof row.original_filename === "string" ? row.original_filename : null,
        fileType: typeof row.file_type === "string" ? row.file_type : null,
      };
    }
  }

  const publicAssetTokens: Record<string, string> = {};
  if (assetIds.length > 0) {
    const { data: assetShareRows } = await (supabaseServer)
      .from("asset_shares")
      .select("asset_id,token,public_enabled,allow_downloads,expires_at")
      .eq("organization_id", org.id)
      .in("asset_id", assetIds);
    for (const row of (assetShareRows || []) as Array<Record<string, unknown>>) {
      const assetId = typeof row.asset_id === "string" ? row.asset_id : null;
      const token = typeof row.token === "string" ? row.token : null;
      const publicEnabled = Boolean(row.public_enabled);
      const allowDownloads = Boolean(row.allow_downloads);
      const expiresAt = typeof row.expires_at === "string" ? row.expires_at : null;
      if (!assetId || !token || !publicEnabled || !allowDownloads || isExpired(expiresAt || undefined)) {
        continue;
      }
      publicAssetTokens[assetId] = token;
    }
  }

  return {
    organizationId: org.id,
    updateId,
    brandName: org.name,
    title: String(updateRecord.title || ""),
    summary: updateRecord.summary ? String(updateRecord.summary) : null,
    urgency: String(updateRecord.urgency || "normal"),
    status: String(updateRecord.status || "draft"),
    dueAt: updateRecord.due_at ? String(updateRecord.due_at) : null,
    publishedAt: updateRecord.published_at ? String(updateRecord.published_at) : null,
    messageJson:
      updateRecord.message_json &&
      typeof updateRecord.message_json === "object" &&
      !Array.isArray(updateRecord.message_json)
        ? (updateRecord.message_json as Record<string, unknown>)
        : {},
    publicEnabled: Boolean(shareRecord.public_enabled),
    expiresAt: String(shareRecord.expires_at),
    kitItems: items,
    productLookup,
    assetLookup,
    publicAssetTokens,
  };
}

const URGENCY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  high: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  normal: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  low: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
};

function ErrorPage({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </main>
  );
}

export default async function PublicUpdateSharePage({
  params,
}: {
  params: Promise<{ tenant: string; token: string }>;
}) {
  const { tenant, token } = await params;
  const shared = await findSharedUpdate({ tenant, token });

  if (!shared) {
    return <ErrorPage title="Link unavailable" description="This kit link is invalid or no longer available." />;
  }
  if (isExpired(shared.expiresAt)) {
    return <ErrorPage title="Link expired" description="This kit link has expired. Ask the brand for a new link." />;
  }
  if (!shared.publicEnabled) {
    return <ErrorPage title="Private link" description="This kit is currently private. Ask the brand to enable public access." />;
  }
  if (shared.status !== "published") {
    return <ErrorPage title="Not published yet" description="This kit is not yet published for external viewing." />;
  }

  const messageBodyHtml = parseMessageBodyHtml(shared.messageJson);
  const messageBlocks = messageBodyHtml ? [] : parseMessageBlocks(shared.messageJson);
  const urgencyColors = URGENCY_COLORS[shared.urgency.toLowerCase()] ?? URGENCY_COLORS.normal;

  await trackPublicShareOpen({
    organizationId: shared.organizationId,
    updateId: shared.updateId,
    tenant,
    token,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-6 rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {shared.brandName || "Brand"}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-foreground">{shared.title}</h1>
            </div>
            <span className={`shrink-0 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium capitalize ${urgencyColors.bg} ${urgencyColors.text} ${urgencyColors.border}`}>
              {shared.urgency}
            </span>
          </div>

          {shared.summary ? (
            <p className="mt-3 text-sm text-muted-foreground">{shared.summary}</p>
          ) : null}

          {shared.dueAt || shared.publishedAt ? (
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {shared.publishedAt ? (
                <span>Published {new Date(shared.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
              ) : null}
              {shared.dueAt ? (
                <span className={new Date(shared.dueAt) < new Date() ? "font-medium text-red-600" : ""}>
                  Due {new Date(shared.dueAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Message */}
        {(messageBodyHtml || messageBlocks.length > 0) ? (
          <div className="mb-6 rounded-xl border border-border bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Message</h2>
            {messageBodyHtml ? (
              <div
                className="prose prose-sm max-w-none text-foreground"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: messageBodyHtml }}
              />
            ) : (
              <div className="space-y-2 text-sm text-foreground">
                {messageBlocks.map((block, idx) => (
                  <p key={`${idx}-${block.slice(0, 12)}`}>{block}</p>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Kit Contents */}
        <div className="mb-6 rounded-xl border border-border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Kit Contents</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {shared.kitItems.length} {shared.kitItems.length === 1 ? "item" : "items"} included
          </p>
          {shared.kitItems.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No kit items were attached.</p>
          ) : (
            <div className="space-y-3">
              {shared.kitItems.map((item) => {
                const product = item.productId ? shared.productLookup[item.productId] : null;
                const asset = item.assetId ? shared.assetLookup[item.assetId] : null;
                const assetToken = item.assetId ? shared.publicAssetTokens[item.assetId] : null;
                const textContent = item.itemType === "text" ? extractTextContent(item.contentJson) : null;

                if (item.itemType === "product") {
                  const productName = product?.name ?? item.title ?? "Product";
                  return (
                    <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border p-4">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50">
                        <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{productName}</p>
                          {product?.type ? (
                            <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                              {product.type}
                            </span>
                          ) : null}
                        </div>
                        {product?.sku ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">SKU: {product.sku}</p>
                        ) : null}
                        {item.description ? (
                          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                if (item.itemType === "asset") {
                  const filename = asset?.filename ?? item.title ?? "Asset";
                  const fileType = asset?.fileType;
                  return (
                    <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border p-4">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-purple-50">
                        <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{filename}</p>
                          {fileType ? (
                            <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                              {fileType.replace(/^\./, "")}
                            </span>
                          ) : null}
                        </div>
                        {item.description ? (
                          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        ) : null}
                      </div>
                      {assetToken ? (
                        <Link
                          href={`/a/${tenant}/${assetToken}`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                          target="_blank"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                          Download
                        </Link>
                      ) : (
                        <span className="shrink-0 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                          Login to download
                        </span>
                      )}
                    </div>
                  );
                }

                if (item.itemType === "url" && item.url) {
                  return (
                    <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border p-4">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-green-50">
                        <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{item.title || "Link"}</p>
                        {item.description ? (
                          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        ) : null}
                        <p className="mt-1 truncate text-xs text-muted-foreground">{item.url}</p>
                      </div>
                      <Link
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                      >
                        Open
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </Link>
                    </div>
                  );
                }

                if (item.itemType === "text" && textContent) {
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-4">
                      {item.title ? (
                        <p className="mb-2 text-sm font-medium text-foreground">{item.title}</p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{textContent}</p>
                    </div>
                  );
                }

                return (
                  <div key={item.id} className="rounded-lg border border-border p-4">
                    <p className="text-sm font-medium text-foreground">{item.title || item.itemType}</p>
                    {item.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sign in CTA */}
        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Work with this brand</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to access full product records, download private assets, and receive ongoing updates.
          </p>
          <div className="mt-4">
            <Button asChild>
              <Link href="/api/auth/login">Sign in</Link>
            </Button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Shared via Stackcess &middot; <Link href="/" className="hover:underline">stackcess.com</Link>
        </p>
      </main>
    </div>
  );
}
