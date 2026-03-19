import { NextRequest, NextResponse } from "next/server";
import { DatabaseQueries } from "@tradetool/database";
import { getAuthSession } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

type LegacySessionOrganization = {
  id: string;
  name: string;
  code: string;
};

// Simple in-memory rate limiter: max 10 calls per IP per minute
const rateMap = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 10;
  const hits = (rateMap.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return true;
  rateMap.set(ip, [...hits, now]);
  return false;
}

function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// Sync organization from Kinde to Supabase.
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const session = await getAuthSession(request);
    if (!session.isAuthenticated || !session.organization) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = new DatabaseQueries(supabaseServer);
    const supabase = supabaseServer;
    const kindeOrg = session.organization as LegacySessionOrganization;

    const slug = sanitizeSlug(kindeOrg.code || `org-${Date.now()}`);
    const existing = await db.getOrganizationBySlug(slug);
    if (existing) {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: kindeOrg.name || existing.name,
          kinde_org_id: kindeOrg.id || existing.kindeOrgId,
        })
        .eq("id", existing.id);

      if (error) {
        console.error("Failed to update organization:", error);
        return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
      }

      return NextResponse.json({
        organization: existing,
        message: "Organization updated",
      });
    }

    const newOrg = await db.createOrganization({
      name: kindeOrg.name || "Unnamed Organization",
      slug,
      kindeOrgId: kindeOrg.id || "",
      storageUsed: 0,
      storageLimit: 5368709120, // 5GB default
      type: "brand",
      organizationType: "brand",
      partnerCategory: null,
    });

    if (!newOrg) {
      return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
    }

    return NextResponse.json({
      organization: newOrg,
      message: "Organization created",
    });
  } catch (error) {
    console.error("Organization sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Get organization info.
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session.isAuthenticated || !session.organization) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = new DatabaseQueries(supabaseServer);
    const kindeOrg = session.organization as LegacySessionOrganization;
    const organization = await db.getOrganizationBySlug(kindeOrg.code);

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ organization });
  } catch (error) {
    console.error("Failed to get organization:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
