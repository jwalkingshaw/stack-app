import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { S3Service, UploadService, ThumbnailService } from "@tradetool/storage";
import { supabaseServer } from "@/lib/supabase";
import { enforceMarketScopedAccess } from "@/lib/market-scope";

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
    const searchParams = new URL(request.url).searchParams;
    const scopeCheck = await enforceMarketScopedAccess({
      authService,
      supabase: supabaseServer as any,
      userId: user.id,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetUpload,
      marketId: searchParams.get("marketId"),
      localeCode: searchParams.get("locale"),
      channelId: searchParams.get("channelId"),
      collectionId: searchParams.get("collectionId"),
    });
    if (!hasAccess && !scopeCheck.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { filename, contentType, folderId } = body;

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "Filename and content type are required" },
        { status: 400 }
      );
    }

    const s3Service = new S3Service();
    const uploadService = new UploadService(s3Service, organization.id, user.id);

    // Validate file type
    const validation = await uploadService.validateFileType(filename, contentType);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Check storage limits
    const fileSize = parseInt(request.headers.get('content-length') || '0');
    if (organization.storageUsed + fileSize > organization.storageLimit) {
      return NextResponse.json(
        { error: "Storage limit exceeded" },
        { status: 413 }
      );
    }

    // Initialize upload
    const uploadResponse = await uploadService.initializeUpload({
      filename,
      contentType,
      folderId: folderId || undefined,
    });

    return NextResponse.json(uploadResponse);
  } catch (error) {
    console.error("Failed to initialize upload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const searchParams = new URL(request.url).searchParams;
    const scopeCheck = await enforceMarketScopedAccess({
      authService,
      supabase: supabaseServer as any,
      userId: user.id,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetUpload,
      marketId: searchParams.get("marketId"),
      localeCode: searchParams.get("locale"),
      channelId: searchParams.get("channelId"),
      collectionId: searchParams.get("collectionId"),
    });
    if (!hasAccess && !scopeCheck.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { 
      assetId, 
      s3Key, 
      filename, 
      originalFilename, 
      contentType, 
      fileSize, 
      folderId 
    } = body;

    if (!assetId || !s3Key || !filename || !originalFilename || !contentType || !fileSize) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const s3Service = new S3Service();
    const uploadService = new UploadService(s3Service, organization.id, user.id);
    const thumbnailService = new ThumbnailService(s3Service);

    // Generate public URL
    const s3Url = s3Service.getPublicUrl(s3Key);

    // Generate thumbnails for supported file types
    const thumbnailUrls = await thumbnailService.generateThumbnails(s3Key, contentType);

    // Get file type category
    const fileType = uploadService.getFileTypeCategory(contentType);

    // Create asset record in database
    const asset = await db.createAsset({
      organizationId: organization.id,
      folderId: folderId || null,
      filename,
      originalFilename,
      fileType,
      fileSize,
      mimeType: contentType,
      filePath: s3Key,
      s3Key,
      s3Url,
      assetType: fileType,
      assetScope: 'internal',
      productIdentifiers: [],
      thumbnailUrls,
      metadata: {},
      tags: [],
      description: undefined,
      createdBy: (user as any).id,
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Failed to create asset record" },
        { status: 500 }
      );
    }

    return NextResponse.json(asset);
  } catch (error) {
    console.error("Failed to complete upload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
