import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // DEVELOPMENT MODE: Return mock folders for demo tenants
    if (params.slug === "demo-org" || params.slug === "test-company") {
      const mockFolders = [
        {
          id: "mock-folder-1",
          organizationId: `mock-${params.slug}`,
          name: "Marketing Assets",
          parentId: null,
          path: "/Marketing Assets",
          createdBy: "demo-user",
          createdAt: new Date().toISOString(),
        },
        {
          id: "mock-folder-2",
          organizationId: `mock-${params.slug}`,
          name: "Brand Guidelines",
          parentId: "mock-folder-1",
          path: "/Marketing Assets/Brand Guidelines",
          createdBy: "demo-user",
          createdAt: new Date().toISOString(),
        },
        {
          id: "mock-folder-3",
          organizationId: `mock-${params.slug}`,
          name: "Product Photos",
          parentId: null,
          path: "/Product Photos",
          createdBy: "demo-user",
          createdAt: new Date().toISOString(),
        }
      ];

      return NextResponse.json({
        data: mockFolders
      });
    }

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

    const folders = await db.getFoldersByOrganization(organization.id);

    return NextResponse.json({
      data: folders
    });
  } catch (error) {
    console.error("Failed to get folders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
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
    const { name, parentId } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Folder name is required" },
        { status: 400 }
      );
    }

    // Generate path based on parent
    let path = `/${name}`;
    if (parentId) {
      // Get parent folder to build path
      const allFolders = await db.getFoldersByOrganization(organization.id);
      const parentFolder = allFolders.find(f => f.id === parentId);
      if (parentFolder) {
        path = `${parentFolder.path}/${name}`;
      }
    }

    const folder = await db.createFolder({
      organizationId: organization.id,
      name: name.trim(),
      parentId: parentId || null,
      path,
      createdBy: user.id,
    });

    if (!folder) {
      return NextResponse.json(
        { error: "Failed to create folder" },
        { status: 500 }
      );
    }

    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    console.error("Failed to create folder:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}