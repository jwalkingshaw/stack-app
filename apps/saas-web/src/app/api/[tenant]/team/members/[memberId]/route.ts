import { NextRequest, NextResponse } from "next/server";
import { AuthService, canChangeRole } from "@stack-app/auth";
import { DatabaseQueries } from "@stack-app/database";

import { supabaseServer } from "@/lib/supabase";
import { requireTenantAccess } from "@/lib/tenant-auth";

type MemberRole = "owner" | "admin" | "editor" | "viewer";

type TeamMemberRow = {
  id: string;
  organization_id: string;
  kinde_user_id: string;
  email: string;
  role: MemberRole;
  status: string;
  joined_at: string | null;
  can_download_assets: boolean;
  can_edit_products: boolean;
  can_manage_team: boolean;
  created_at: string | null;
  updated_at: string | null;
};

const EDITABLE_ROLE_OPTIONS: Array<Extract<MemberRole, "admin" | "editor" | "viewer">> = [
  "admin",
  "editor",
  "viewer",
];

function parseEditableRole(value: unknown): Extract<MemberRole, "admin" | "editor" | "viewer"> | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return EDITABLE_ROLE_OPTIONS.includes(normalized as Extract<MemberRole, "admin" | "editor" | "viewer">)
    ? (normalized as Extract<MemberRole, "admin" | "editor" | "viewer">)
    : null;
}

function isMemberRole(value: unknown): value is MemberRole {
  return value === "owner" || value === "admin" || value === "editor" || value === "viewer";
}

async function loadMemberById(params: {
  organizationId: string;
  memberId: string;
}): Promise<TeamMemberRow | null> {
  const { organizationId, memberId } = params;
  const { data, error } = await supabaseServer
    .from("organization_members")
    .select(
      "id,organization_id,kinde_user_id,email,role,status,joined_at,can_download_assets,can_edit_products,can_manage_team,created_at,updated_at"
    )
    .eq("organization_id", organizationId)
    .eq("id", memberId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("Failed to load team member:", error);
    return null;
  }
  if (!data || !isMemberRole(data.role)) return null;

  return data as TeamMemberRow;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; memberId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) return tenantAccess.response;

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    const permissions = await authService.getUserPermissions(userId, organization.id);
    const canManageMembers = Boolean(permissions.is_owner || permissions.is_admin);

    if (!canManageMembers) {
      return NextResponse.json(
        { error: "Access denied. You must be an admin or owner to manage team members." },
        { status: 403 }
      );
    }

    const member = await loadMemberById({
      organizationId: organization.id,
      memberId: resolvedParams.memberId,
    });
    if (!member) {
      return NextResponse.json({ error: "Team member not found." }, { status: 404 });
    }

    const roleOptions = EDITABLE_ROLE_OPTIONS.filter((roleOption) =>
      canChangeRole(permissions, member.role, roleOption).allowed
    );
    const roleChangeCheck = canChangeRole(permissions, member.role, member.role);
    const removeCheck = canChangeRole(permissions, member.role, "viewer");
    const isCurrentUser = member.kinde_user_id === userId;

    return NextResponse.json({
      success: true,
      data: {
        member,
        capabilities: {
          can_change_role: roleChangeCheck.allowed && roleOptions.length > 0,
          can_remove: removeCheck.allowed && !isCurrentUser,
          role_options: roleOptions,
          is_current_user: isCurrentUser,
        },
      },
    });
  } catch (error) {
    console.error("Error in team member GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; memberId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) return tenantAccess.response;

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    const permissions = await authService.getUserPermissions(userId, organization.id);
    const canManageMembers = Boolean(permissions.is_owner || permissions.is_admin);
    if (!canManageMembers) {
      return NextResponse.json(
        { error: "Access denied. You must be an admin or owner to manage team members." },
        { status: 403 }
      );
    }

    const member = await loadMemberById({
      organizationId: organization.id,
      memberId: resolvedParams.memberId,
    });
    if (!member) {
      return NextResponse.json({ error: "Team member not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const nextRole = parseEditableRole(body.role);
    if (!nextRole) {
      return NextResponse.json(
        { error: "Role must be one of: admin, editor, viewer." },
        { status: 400 }
      );
    }

    const transitionCheck = canChangeRole(permissions, member.role, nextRole);
    if (!transitionCheck.allowed) {
      return NextResponse.json(
        { error: transitionCheck.reason || "Role change is not allowed." },
        { status: 403 }
      );
    }

    const updated = await db.updateMemberRole(member.id, nextRole);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update member role." }, { status: 500 });
    }

    const refreshed = await loadMemberById({
      organizationId: organization.id,
      memberId: member.id,
    });
    if (!refreshed) {
      return NextResponse.json({ error: "Failed to reload updated member." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { member: refreshed },
    });
  } catch (error) {
    console.error("Error in team member PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; memberId: string }> }
) {
  try {
    const resolvedParams = await params;
    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) return tenantAccess.response;

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    const permissions = await authService.getUserPermissions(userId, organization.id);
    const canManageMembers = Boolean(permissions.is_owner || permissions.is_admin);
    if (!canManageMembers) {
      return NextResponse.json(
        { error: "Access denied. You must be an admin or owner to manage team members." },
        { status: 403 }
      );
    }

    const member = await loadMemberById({
      organizationId: organization.id,
      memberId: resolvedParams.memberId,
    });
    if (!member) {
      return NextResponse.json({ error: "Team member not found." }, { status: 404 });
    }

    if (member.kinde_user_id === userId) {
      return NextResponse.json(
        { error: "You cannot remove your own membership from this page." },
        { status: 400 }
      );
    }

    const removeCheck = canChangeRole(permissions, member.role, "viewer");
    if (!removeCheck.allowed) {
      return NextResponse.json(
        { error: removeCheck.reason || "Member removal is not allowed." },
        { status: 403 }
      );
    }

    const removed = await db.removeMember(member.id);
    if (!removed) {
      return NextResponse.json({ error: "Failed to remove member." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Removed ${member.email} from the workspace.`,
    });
  } catch (error) {
    console.error("Error in team member DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

