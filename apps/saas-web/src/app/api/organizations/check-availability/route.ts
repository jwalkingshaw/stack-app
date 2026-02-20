import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@tradetool/database";
import { kindeAPI } from "@/lib/kinde-management";

const supabase = createServerClient();
const db = new DatabaseQueries(supabase);

// GET /api/organizations/check-availability?slug=example-org
export async function GET(request: NextRequest) {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        { error: "Slug parameter is required" },
        { status: 400 }
      );
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug)) {
      return NextResponse.json({
        available: false,
        reason: "invalid_format",
        message: "Slug can only contain lowercase letters, numbers, and hyphens"
      });
    }

    // Check minimum length
    if (slug.length < 3) {
      return NextResponse.json({
        available: false,
        reason: "too_short",
        message: "Organization name must be at least 3 characters long"
      });
    }

    // Check maximum length
    if (slug.length > 50) {
      return NextResponse.json({
        available: false,
        reason: "too_long",
        message: "Organization name must be less than 50 characters long"
      });
    }

    // Reserved slugs check
    const reservedSlugs = [
      'api', 'app', 'www', 'admin', 'support', 'help', 'blog', 'docs', 
      'status', 'dashboard', 'login', 'signup', 'register', 'auth',
      'demo', 'test', 'staging', 'prod', 'production', 'dev', 'development',
      'mail', 'email', 'ftp', 'ssh', 'ssl', 'cdn', 'static', 'assets',
      'about', 'contact', 'privacy', 'terms', 'legal', 'security'
    ];

    if (reservedSlugs.includes(slug.toLowerCase())) {
      return NextResponse.json({
        available: false,
        reason: "reserved",
        message: "This name is reserved. Please choose a different name."
      });
    }

    console.log('🔍 Checking availability for slug:', slug);

    // Check Kinde organizations first (source of truth for onboarding)
    try {
      console.time(`kinde-check-${slug}`);
      
      // Use the faster getOrganizationByCode method instead of getting all orgs
      const existingOrg = await kindeAPI.getOrganizationByCode(slug);
      
      console.timeEnd(`kinde-check-${slug}`);

      if (existingOrg) {
        console.log('❌ Slug taken in Kinde:', slug);
        return NextResponse.json({
          available: false,
          reason: "taken",
          message: "This organization name is already taken"
        });
      }
    } catch (kindeError) {
      console.warn('⚠️ Kinde check failed, falling back to Supabase check:', kindeError);
      
      // Fallback to Supabase only if Kinde fails
      const existingSupabaseOrg = await db.getOrganizationBySlug(slug);
      if (existingSupabaseOrg) {
        console.log('❌ Slug taken in Supabase (fallback):', slug);
        return NextResponse.json({
          available: false,
          reason: "taken",
          message: "This organization name is already taken"
        });
      }
    }

    console.log('✅ Slug available:', slug);
    return NextResponse.json({
      available: true,
      slug: slug,
      message: "This organization name is available!"
    });

  } catch (error) {
    console.error("Slug availability check error:", error);
    return NextResponse.json(
      { 
        error: "Failed to check availability",
        available: false,
        reason: "server_error"
      },
      { status: 500 }
    );
  }
}