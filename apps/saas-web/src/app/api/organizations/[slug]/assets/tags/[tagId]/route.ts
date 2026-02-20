import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { applyRLSContext } from "@/lib/rls-context";
import { ensureSlug } from "@/lib/slug";
import { enforceMarketScopedAccess } from "@/lib/market-scope";

function resolveSlug(
  currentSlug: string,
  proposedName: string | undefined,
  existing: Set<string>
) {
  if (!proposedName) return currentSlug;
  const base = ensureSlug(proposedName);
  if (base === currentSlug) return currentSlug;
  if (!existing.has(base)) return base;
  let counter = 2;
  let candidate = `${base}-${counter}`;
  while (existing.has(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; tagId: string }> }
) {
  try {
    const { slug, tagId } = await params;
    const payload = await request.json();

    const name =
      typeof payload?.name === "string" ? payload.name.trim() : undefined;
    const description =
      typeof payload?.description === "string"
        ? payload.description.trim()
        : undefined;
    const color =
      typeof payload?.color === "string" ? payload.color.trim() : undefined;

    if (name !== undefined && name.length === 0) {
      return NextResponse.json(
        { error: "Tag name cannot be empty" },
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

    const existingTag = await db.getAssetTagById(tagId, organization.id);
    if (!existingTag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    const allTags = await db.getAssetTags(organization.id);
    const slugSet = new Set(allTags.filter((t) => t.id !== tagId).map((t) => t.slug));
    const resolvedSlug = resolveSlug(existingTag.slug, name, slugSet);

    const updatedTag = await db.updateAssetTag(tagId, organization.id, {
      name: name ?? existingTag.name,
      description: description ?? existingTag.description ?? null,
      color: color ?? existingTag.color ?? null,
      slug: resolvedSlug,
    });

    if (!updatedTag) {
      return NextResponse.json(
        { error: "Failed to update tag" },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedTag);
  } catch (error) {
    console.error("Failed to update asset tag:", error);
    return NextResponse.json(
      { error: "Failed to update asset tag" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; tagId: string }> }
) {
  try {
    const { slug, tagId } = await params;

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

    const existingTag = await db.getAssetTagById(tagId, organization.id);
    if (!existingTag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    const success = await db.deleteAssetTag(tagId, organization.id);
    if (!success) {
      return NextResponse.json(
        { error: "Failed to delete tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete asset tag:", error);
    return NextResponse.json(
      { error: "Failed to delete asset tag" },
      { status: 500 }
    );
  }
}
