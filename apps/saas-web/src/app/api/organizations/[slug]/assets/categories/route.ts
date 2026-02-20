import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { applyRLSContext } from "@/lib/rls-context";
import { ensureSlug } from "@/lib/slug";
import type { AssetCategory } from "@tradetool/types";
import { enforceMarketScopedAccess } from "@/lib/market-scope";

function resolveUniqueSlug(base: string, existing: Set<string>) {
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

    const categories: AssetCategory[] = await db.getAssetCategories(organization.id);
    return NextResponse.json({ data: categories });
  } catch (error) {
    console.error("Failed to list asset categories:", error);
    return NextResponse.json(
      { error: "Failed to list asset categories" },
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
    const parentId =
      typeof payload?.parentId === "string" && payload.parentId.length > 0
        ? payload.parentId
        : null;
    const description =
      typeof payload?.description === "string"
        ? payload.description.trim()
        : undefined;

    if (!name) {
      return NextResponse.json(
        { error: "Category name is required" },
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

    const categories = await db.getAssetCategories(organization.id);

    const duplicateName = categories.some(
      (category) =>
        (category.parentId || null) === parentId &&
        category.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicateName) {
      return NextResponse.json(
        { error: "Category name already exists in this level" },
        { status: 409 }
      );
    }

    let parentCategory = null;
    if (parentId) {
      parentCategory = await db.getAssetCategoryById(parentId, organization.id);
      if (!parentCategory) {
        return NextResponse.json(
          { error: "Parent category not found" },
          { status: 404 }
        );
      }
    }

    const slugSet = new Set(categories.map((category) => category.slug));
    const baseSlug = ensureSlug(name);
    const resolvedSlug = resolveUniqueSlug(baseSlug, slugSet);

    const path = parentCategory
      ? `${parentCategory.path}/${name}`
      : `/${name}`;

    const category = await db.createAssetCategory({
      organizationId: organization.id,
      name,
      slug: resolvedSlug,
      path,
      parentId,
      description: description ?? null,
      createdBy: user.id,
    });

    if (!category) {
      return NextResponse.json(
        { error: "Failed to create category" },
        { status: 500 }
      );
    }

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Failed to create asset category:", error);
    return NextResponse.json(
      { error: "Failed to create asset category" },
      { status: 500 }
    );
  }
}
