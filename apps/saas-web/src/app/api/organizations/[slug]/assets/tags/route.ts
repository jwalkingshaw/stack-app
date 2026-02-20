import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { applyRLSContext } from "@/lib/rls-context";
import { ensureSlug } from "@/lib/slug";
import { enforceMarketScopedAccess } from "@/lib/market-scope";

function buildUniqueSlug(base: string, existing: Set<string>) {
  if (!existing.has(base)) return base;
  let counter = 2;
  let candidate = `${base}-${counter}`;
  while (existing.has(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const db = new DatabaseQueries(supabaseServer);
    const auth = new AuthService(db);

    const user = await auth.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await auth.getCurrentOrganization(slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await auth.hasOrganizationAccess(user.id, organization.id);
    const searchParams = new URL(request.url).searchParams;
    const scopeCheck = await enforceMarketScopedAccess({
      authService: auth,
      supabase: supabaseServer as any,
      userId: user.id,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetDownloadDerivative,
      marketId: searchParams.get("marketId"),
      localeCode: searchParams.get("locale"),
      channelId: searchParams.get("channelId"),
      collectionId: searchParams.get("collectionId"),
    });
    if (!hasAccess && !scopeCheck.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await applyRLSContext(supabaseServer, {
      userId: user.id,
      organizationId: organization.id,
      organizationCode: organization.kindeOrgId,
    });

    const tags = await db.getAssetTags(organization.id);
    return NextResponse.json({ data: tags });
  } catch (error) {
    console.error("Failed to list asset tags:", error);
    return NextResponse.json(
      { error: "Failed to list asset tags" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const payload = await request.json();

    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    const color = typeof payload?.color === "string" ? payload.color.trim() : undefined;
    const description =
      typeof payload?.description === "string" ? payload.description.trim() : undefined;

    if (!name) {
      return NextResponse.json(
        { error: "Tag name is required" },
        { status: 400 }
      );
    }

    const db = new DatabaseQueries(supabaseServer);
    const auth = new AuthService(db);

    const user = await auth.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await auth.getCurrentOrganization(slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const searchParams = new URL(request.url).searchParams;
    const [legacyCanEdit, scopeCheck] = await Promise.all([
      auth.canEditProducts(user.id, organization.id),
      enforceMarketScopedAccess({
        authService: auth,
        supabase: supabaseServer as any,
        userId: user.id,
        organizationId: organization.id,
        permissionKey: ScopedPermission.AssetMetadataEdit,
        marketId: searchParams.get("marketId"),
        localeCode: searchParams.get("locale"),
        channelId: searchParams.get("channelId"),
        collectionId: searchParams.get("collectionId"),
      }),
    ]);
    if (!legacyCanEdit && !scopeCheck.ok) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    await applyRLSContext(supabaseServer, {
      userId: user.id,
      organizationId: organization.id,
      organizationCode: organization.kindeOrgId,
    });

    const existing = await db.getAssetTags(organization.id);
    const existingSlugs = new Set(existing.map((tag) => tag.slug));

    const baseSlug = ensureSlug(name);
    const resolvedSlug = buildUniqueSlug(baseSlug, existingSlugs);

    const tag = await db.createAssetTag({
      organizationId: organization.id,
      name,
      slug: resolvedSlug,
      description: description ?? null,
      color: color ?? null,
      createdBy: user.id,
    });

    if (!tag) {
      return NextResponse.json(
        { error: "Failed to create tag" },
        { status: 500 }
      );
    }

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error("Failed to create asset tag:", error);
    return NextResponse.json(
      { error: "Failed to create asset tag" },
      { status: 500 }
    );
  }
}
