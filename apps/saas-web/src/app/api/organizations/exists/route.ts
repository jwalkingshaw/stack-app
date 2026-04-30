import { getSupabaseServer } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@stack-app/database";
import { kindeAPI } from "@/lib/kinde-management";
import { cache as redisCache, CacheKeys, CacheTTL } from "@/lib/redis";

const supabase = createServerClient();
const db = new DatabaseQueries(getSupabaseServer());

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
    const slug = searchParams.get('slug')?.trim().toLowerCase();

    if (!slug) {
      return NextResponse.json({ error: "Slug parameter is required" }, { status: 400 });
    }

    // Check distributed/local fallback cache first (5 minute TTL).
    const cacheKey = CacheKeys.organizationSlugExists(slug);
    const cached = await redisCache.get<{ exists: boolean }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Validate slug format quickly
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug) || slug.length < 3 || slug.length > 50) {
      const payload = { exists: true }; // Invalid format = "taken"
      await redisCache.set(cacheKey, payload, CacheTTL.ORG_EXISTS);
      return NextResponse.json(payload);
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
      const payload = { exists: true };
      await redisCache.set(cacheKey, payload, CacheTTL.ORG_EXISTS);
      return NextResponse.json(payload);
    }

    // Check Kinde first (source of truth)
    try {
      const existingOrg = await kindeAPI.getOrganizationByCode(slug);
      const exists = !!existingOrg;
      const payload = { exists };
      await redisCache.set(cacheKey, payload, CacheTTL.ORG_EXISTS);
      return NextResponse.json(payload);
      
    } catch (kindeError) {
      console.warn('Kinde check failed in exists endpoint:', kindeError);
      
      // Fallback to getSupabaseServer()
      const existingOrg = await db.getOrganizationBySlug(slug);
      const exists = !!existingOrg;
      const payload = { exists };
      await redisCache.set(cacheKey, payload, CacheTTL.SHORT);
      return NextResponse.json(payload);
    }

  } catch (error) {
    console.error("Slug existence check error:", error);
    return NextResponse.json(
      { error: "Failed to check existence", exists: true }, // Assume taken on error
      { status: 500 }
    );
  }
}
