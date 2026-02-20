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

    if (!Array.isArray(payload?.tagIds)) {
      return NextResponse.json(
        { error: "tagIds must be an array" },
        { status: 400 }
      );
    }

    const tagIds = payload.tagIds
      .filter((value: unknown) => typeof value === "string")
      .map((value: string) => value.trim())
      .filter(Boolean);

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

    const tags = await db.getAssetTags(organization.id);
    const validIds = new Set(tags.map((tag) => tag.id));

    const invalidIds = tagIds.filter((tagId: string) => !validIds.has(tagId));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "One or more tags are invalid for this organization" },
        { status: 400 }
      );
    }

    const assignments = await db.replaceAssetTags(assetId, tagIds, user.id);
    return NextResponse.json({ data: assignments });
  } catch (error) {
    console.error("Failed to update asset tags:", error);
    return NextResponse.json(
      { error: "Failed to update asset tags" },
      { status: 500 }
    );
  }
}
