import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { applyRLSContext } from "@/lib/rls-context";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id: assetId } = await params;
    const payload = await request.json();

    if (!Array.isArray(payload?.categoryIds)) {
      return NextResponse.json(
        { error: "categoryIds must be an array" },
        { status: 400 }
      );
    }

    const categoryIds = payload.categoryIds
      .filter((value: unknown) => typeof value === "string")
      .map((value: string) => value.trim())
      .filter(Boolean);

    let primaryCategoryId: string | null = null;
    if (payload?.primaryCategoryId !== undefined) {
      if (
        typeof payload.primaryCategoryId === "string" &&
        payload.primaryCategoryId.trim().length > 0
      ) {
        primaryCategoryId = payload.primaryCategoryId.trim();
      } else if (payload.primaryCategoryId !== null) {
        return NextResponse.json(
          { error: "primaryCategoryId must be a string or null" },
          { status: 400 }
        );
      }
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

    const canEdit = await auth.canEditProducts(user.id, organization.id);
    if (!canEdit) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    await applyRLSContext(supabaseServer, {
      userId: user.id,
      organizationId: organization.id,
      organizationCode: organization.kindeOrgId,
    });

    const asset = await db.getAssetById(assetId, organization.id);
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const categories = await db.getAssetCategories(organization.id);
    const validIds = new Set(categories.map((category) => category.id));

    const invalidIds = categoryIds.filter((categoryId: string) => !validIds.has(categoryId));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "One or more categories are invalid for this organization" },
        { status: 400 }
      );
    }

    if (primaryCategoryId && !validIds.has(primaryCategoryId)) {
      return NextResponse.json(
        { error: "primaryCategoryId is not valid for this organization" },
        { status: 400 }
      );
    }

    if (primaryCategoryId && !categoryIds.includes(primaryCategoryId)) {
      categoryIds.push(primaryCategoryId);
    }

    const assignments = await db.replaceAssetCategories(
      assetId,
      categoryIds,
      user.id,
      primaryCategoryId
    );

    return NextResponse.json({ data: assignments });
  } catch (error) {
    console.error("Failed to update asset categories:", error);
    return NextResponse.json(
      { error: "Failed to update asset categories" },
      { status: 500 }
    );
  }
}
