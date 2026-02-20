import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { enforceMarketScopedAccess } from "@/lib/market-scope";
import { enforceCollectionScope } from "@/lib/collection-scope";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await params;

    // DEVELOPMENT MODE: Return mock data for demo tenants
    if (resolvedParams.slug === "demo-org" || resolvedParams.slug === "test-company") {
      const mockAssets = [
        {
          id: "mock-asset-1",
          organizationId: `mock-${resolvedParams.slug}`,
          folderId: null,
          filename: "sample-image.jpg",
          originalFilename: "sample-image.jpg",
          fileType: "image",
          fileSize: 1024000,
          mimeType: "image/jpeg",
          s3Key: "mock/sample-image.jpg",
          s3Url: "https://picsum.photos/400/300",
          thumbnailUrls: {
            small: "https://picsum.photos/150/150",
            medium: "https://picsum.photos/300/300",
            large: "https://picsum.photos/600/600",
          },
          metadata: {},
          tags: ["sample", "demo"],
          description: "A sample image for demonstration",
          createdBy: "demo-user",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "mock-asset-2",
          organizationId: `mock-${resolvedParams.slug}`,
          folderId: null,
          filename: "document.pdf",
          originalFilename: "sample-document.pdf",
          fileType: "document",
          fileSize: 512000,
          mimeType: "application/pdf",
          s3Key: "mock/document.pdf",
          s3Url: "#",
          thumbnailUrls: {},
          metadata: {},
          tags: ["document", "sample"],
          description: "A sample PDF document",
          createdBy: "demo-user",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      ];

      return NextResponse.json({
        data: mockAssets,
        pagination: {
          limit: 50,
          offset: 0,
          total: mockAssets.length,
        }
      });
    }

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    
    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(resolvedParams.slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    const url = new URL(request.url);
    const marketId = url.searchParams.get("marketId");
    const locale = url.searchParams.get("locale");
    const channelId = url.searchParams.get("channelId");
    const collectionId = url.searchParams.get("collectionId");

    const scopeCheck = await enforceMarketScopedAccess({
      authService,
      supabase: supabaseServer as any,
      userId: user.id,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetDownloadDerivative,
      marketId,
      localeCode: locale,
      channelId,
      collectionId,
    });
    if (!hasAccess && !scopeCheck.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const folderId = url.searchParams.get('folderId');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const collectionScope = await enforceCollectionScope({
      supabase: supabaseServer as any,
      organizationId: organization.id,
      collectionId,
    });
    if (!collectionScope.ok) {
      return collectionScope.response;
    }

    const rawAssets = await db.getAssetsByOrganization(
      organization.id,
      folderId || undefined,
      limit,
      offset
    );
    const assets = collectionScope.assetIds
      ? rawAssets.filter((asset) => collectionScope.assetIds!.includes(asset.id))
      : rawAssets;

    return NextResponse.json({
      data: assets,
      pagination: {
        limit,
        offset,
        total: assets.length,
      }
    });
  } catch (error) {
    console.error("Failed to get assets:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await params;

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    
    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(resolvedParams.slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    const url = new URL(request.url);
    const marketId = url.searchParams.get("marketId");
    const locale = url.searchParams.get("locale");
    const channelId = url.searchParams.get("channelId");
    const collectionId = url.searchParams.get("collectionId");

    const scopeCheck = await enforceMarketScopedAccess({
      authService,
      supabase: supabaseServer as any,
      userId: user.id,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetUpload,
      marketId,
      localeCode: locale,
      channelId,
      collectionId,
    });
    if (!hasAccess && !scopeCheck.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { 
      filename, 
      originalFilename, 
      fileType, 
      fileSize, 
      mimeType, 
      s3Key, 
      s3Url, 
      folderId,
      thumbnailUrls,
      metadata,
      tags = [],
      description 
    } = body;

    if (!filename || !originalFilename || !fileType || !fileSize || !mimeType || !s3Key || !s3Url) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const asset = await db.createAsset({
      organizationId: organization.id,
      folderId: folderId || null,
      filename,
      originalFilename,
      fileType,
      fileSize,
      mimeType,
      s3Key,
      s3Url,
      thumbnailUrls: thumbnailUrls || {},
      metadata: metadata || {},
      tags,
      description: description || null,
      createdBy: user.id,
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Failed to create asset" },
        { status: 500 }
      );
    }

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Failed to create asset:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
