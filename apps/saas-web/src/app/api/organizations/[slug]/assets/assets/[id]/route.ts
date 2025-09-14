import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { S3Service, ThumbnailService } from "@tradetool/storage";
import { supabaseServer } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    
    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(params.slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get asset by ID
    const assets = await db.getAssetsByOrganization(organization.id);
    const asset = assets.find(a => a.id === params.id);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json(asset);
  } catch (error) {
    console.error("Failed to get asset:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    
    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(params.slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { tags, description, filename } = body;

    // Get current asset
    const assets = await db.getAssetsByOrganization(organization.id);
    const asset = assets.find(a => a.id === params.id);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Update asset
    const updatedAsset = await db.updateAsset(params.id, {
      tags: tags !== undefined ? tags : undefined,
      description: description !== undefined ? description : undefined,
      filename: filename !== undefined ? filename : undefined,
    });

    return NextResponse.json(updatedAsset);
  } catch (error) {
    console.error("Failed to update asset:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  try {
    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    
    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(params.slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get asset by ID
    const assets = await db.getAssetsByOrganization(organization.id);
    const asset = assets.find(a => a.id === params.id);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const s3Service = new S3Service();
    const thumbnailService = new ThumbnailService(s3Service);

    try {
      // Delete from S3
      await s3Service.deleteObject(asset.s3Key);
      
      // Delete thumbnails
      await thumbnailService.deleteThumbnails(asset.s3Key);
    } catch (s3Error) {
      console.warn("Failed to delete from S3:", s3Error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete from database
    const deleted = await db.deleteAsset(params.id);
    
    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete asset from database" },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ message: "Asset deleted successfully" });
  } catch (error) {
    console.error("Failed to delete asset:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}