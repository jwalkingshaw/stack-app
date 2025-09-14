import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@tradetool/database";
import { kindeAPI } from "@/lib/kinde-management";

const supabase = createServerClient();
const db = new DatabaseQueries(supabase);

// Simple cache for organization slugs (in-memory for development)
const slugsCache: { [key: string]: { exists: boolean; expiry: number } } = {};

// GET /api/organizations/exists?slug=example-org
// Super fast boolean-only endpoint for real-time checking
export async function GET(request: NextRequest) {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json({ error: "Slug parameter is required" }, { status: 400 });
    }

    // Check cache first (5 minute cache for existence checks)
    const cacheKey = `slug:${slug}`;
    const cached = slugsCache[cacheKey];
    if (cached && Date.now() < cached.expiry) {
      return NextResponse.json({ exists: cached.exists });
    }

    // Validate slug format quickly
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug) || slug.length < 3 || slug.length > 50) {
      return NextResponse.json({ exists: true }); // Invalid format = "taken"
    }

    // Reserved slugs
    const reservedSlugs = [
      'api', 'app', 'www', 'admin', 'support', 'help', 'blog', 'docs', 
      'status', 'dashboard', 'login', 'signup', 'register', 'auth',
      'demo', 'test', 'staging', 'prod', 'production', 'dev', 'development',
      'mail', 'email', 'ftp', 'ssh', 'ssl', 'cdn', 'static', 'assets',
      'about', 'contact', 'privacy', 'terms', 'legal', 'security'
    ];

    if (reservedSlugs.includes(slug.toLowerCase())) {
      slugsCache[cacheKey] = { exists: true, expiry: Date.now() + 300000 }; // 5 min cache
      return NextResponse.json({ exists: true });
    }

    // Check Kinde first (source of truth)
    try {
      const existingOrg = await kindeAPI.getOrganizationByCode(slug);
      const exists = !!existingOrg;
      
      // Cache the result
      slugsCache[cacheKey] = { exists, expiry: Date.now() + 300000 }; // 5 min cache
      return NextResponse.json({ exists });
      
    } catch (kindeError) {
      console.warn('Kinde check failed in exists endpoint:', kindeError);
      
      // Fallback to Supabase
      const existingOrg = await db.getOrganizationBySlug(slug);
      const exists = !!existingOrg;
      
      // Cache the result (shorter cache for fallback)
      slugsCache[cacheKey] = { exists, expiry: Date.now() + 60000 }; // 1 min cache
      return NextResponse.json({ exists });
    }

  } catch (error) {
    console.error("Slug existence check error:", error);
    return NextResponse.json(
      { error: "Failed to check existence", exists: true }, // Assume taken on error
      { status: 500 }
    );
  }
}