import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { applyRLSContext } from "@/lib/rls-context";
import { ensureSlug } from "@/lib/slug";
import type { AssetCategory } from "@tradetool/types";
import { enforceMarketScopedAccess } from "@/lib/market-scope";

function uniqueSlug(base: string, excludeId: string, categories: AssetCategory[]) {
  const baseSlug = ensureSlug(base);
  const slugSet = new Set(
    categories
      .filter((category) => category.id !== excludeId)
      .map((category) => category.slug)
  );
  if (!slugSet.has(baseSlug)) return baseSlug;
  let counter = 2;
  let candidate = `${baseSlug}-${counter}`;
  while (slugSet.has(candidate)) {
    counter += 1;
    candidate = `${baseSlug}-${counter}`;
  }
  return candidate;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoryId: string }> }
) {
  try {
    const { slug, categoryId } = await params;
    const payload = await request.json();

    const name =
      typeof payload?.name === "string" ? payload.name.trim() : undefined;
    const description =
      typeof payload?.description === "string"
        ? payload.description.trim()
        : undefined;

    if (name !== undefined && name.length === 0) {
      return NextResponse.json(
        { error: "Category name cannot be empty" },
        { status: 400 }
      );
    }

    if (payload?.parentId !== undefined) {
      return NextResponse.json(
        { error: "Updating the parent category is not supported yet" },
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

    const existingCategory = await db.getAssetCategoryById(categoryId, organization.id);
    if (!existingCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const categories: AssetCategory[] = await db.getAssetCategories(organization.id);

    if (name) {
      const duplicate = categories.some(
        (category) =>
          category.id !== categoryId &&
          (category.parentId || null) === (existingCategory.parentId || null) &&
          category.name.toLowerCase() === name.toLowerCase()
      );

      if (duplicate) {
        return NextResponse.json(
          { error: "Category name already exists in this level" },
          { status: 409 }
        );
      }
    }

    const updatedName = name ?? existingCategory.name;
    const slugValue = uniqueSlug(updatedName, categoryId, categories);
    const newPath = existingCategory.parentId
      ? `${categories.find((c) => c.id === existingCategory.parentId)?.path ?? ""}/${updatedName}`
      : `/${updatedName}`;

    const updatedCategory = await db.updateAssetCategory(categoryId, organization.id, {
      name: updatedName,
      slug: slugValue,
      description: description ?? existingCategory.description ?? null,
      path: newPath,
    });

    if (!updatedCategory) {
      return NextResponse.json(
        { error: "Failed to update category" },
        { status: 500 }
      );
    }

    if (updatedCategory.path !== existingCategory.path) {
      await db.updateCategoryDescendantPaths(
        categoryId,
        existingCategory.path,
        updatedCategory.path
      );
    }

    return NextResponse.json(updatedCategory);
  } catch (error) {
    console.error("Failed to update asset category:", error);
    return NextResponse.json(
      { error: "Failed to update asset category" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; categoryId: string }> }
) {
  try {
    const { slug, categoryId } = await params;

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

    const categories: AssetCategory[] = await db.getAssetCategories(organization.id);
    const category = categories.find((item) => item.id === categoryId);

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const hasChildren = categories.some(
      (item) => (item.parentId || null) === categoryId
    );

    if (hasChildren) {
      return NextResponse.json(
        { error: "Cannot delete a category that has sub-categories" },
        { status: 409 }
      );
    }

    const deleted = await db.deleteAssetCategory(categoryId, organization.id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete category" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete asset category:", error);
    return NextResponse.json(
      { error: "Failed to delete asset category" },
      { status: 500 }
    );
  }
}
