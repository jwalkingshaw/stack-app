import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@tradetool/database";
import { kindeAPI } from "@/lib/kinde-management";

const supabase = createServerClient();
const db = new DatabaseQueries(supabase);

// Helper function to check if a slug is available
async function isSlugAvailable(slug: string): Promise<boolean> {
  try {
    // Check Kinde first (source of truth) - use faster single org check
    try {
      const existingOrg = await kindeAPI.getOrganizationByCode(slug);
      return !existingOrg;
    } catch (kindeError) {
      // Fallback to Supabase only if Kinde fails
      console.warn('Kinde check failed in suggestion, using Supabase fallback:', kindeError);
      const existingOrg = await db.getOrganizationBySlug(slug);
      return !existingOrg;
    }
  } catch (error) {
    return false;
  }
}

// Generate creative alternatives
function generateAlternatives(originalSlug: string, companyName: string): string[] {
  const alternatives: string[] = [];
  const currentYear = new Date().getFullYear();
  
  // Extract words from company name for variations
  const words = companyName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);

  // Pattern 1: Add industry terms
  const industryTerms = ['nutrition', 'sports', 'health', 'wellness', 'fitness', 'pro', 'labs', 'co'];
  industryTerms.forEach(term => {
    alternatives.push(`${originalSlug}-${term}`);
  });

  // Pattern 2: Add year/numbers
  alternatives.push(`${originalSlug}-${currentYear}`);
  alternatives.push(`${originalSlug}-2024`);
  for (let i = 2; i <= 5; i++) {
    alternatives.push(`${originalSlug}-${i}`);
  }

  // Pattern 3: Abbreviations and variations
  if (words.length > 1) {
    // Use initials
    const initials = words.map(w => w.charAt(0)).join('');
    if (initials.length >= 2) {
      alternatives.push(`${initials}-${industryTerms[0]}`);
      alternatives.push(`${initials}-sports`);
    }
    
    // Use different word combinations
    alternatives.push(words.join('-'));
    if (words.length >= 2) {
      alternatives.push(`${words[0]}-${words[words.length - 1]}`);
    }
  }

  // Pattern 4: Add location/scale terms
  const scaleTerms = ['global', 'usa', 'premium', 'elite', 'max', 'prime'];
  scaleTerms.slice(0, 2).forEach(term => {
    alternatives.push(`${originalSlug}-${term}`);
  });

  // Pattern 5: Creative variations
  alternatives.push(`the-${originalSlug}`);
  alternatives.push(`${originalSlug}-brand`);
  alternatives.push(`${originalSlug}-group`);

  // Remove duplicates and filter out invalid ones
  return [...new Set(alternatives)].filter(slug => 
    slug.length >= 3 && 
    slug.length <= 50 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

// GET /api/organizations/suggest-alternatives?slug=taken-slug&name=Company Name
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
    const originalSlug = searchParams.get('slug');
    const companyName = searchParams.get('name') || originalSlug || '';

    if (!originalSlug) {
      return NextResponse.json(
        { error: "Slug parameter is required" },
        { status: 400 }
      );
    }

    console.log('🎯 Generating suggestions for:', originalSlug);

    // Generate potential alternatives
    const potentialAlternatives = generateAlternatives(originalSlug, companyName);
    
    // Check availability for each suggestion (limit to 8 for performance)
    const suggestions: Array<{slug: string, available: boolean}> = [];
    const maxSuggestions = 8;
    let checked = 0;

    for (const suggestion of potentialAlternatives) {
      if (suggestions.filter(s => s.available).length >= maxSuggestions) break;
      if (checked >= 15) break; // Limit API calls

      const available = await isSlugAvailable(suggestion);
      suggestions.push({ slug: suggestion, available });
      checked++;

      // Add small delay to prevent rate limiting
      if (checked % 3 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Filter to only available suggestions and take top results
    const availableSuggestions = suggestions
      .filter(s => s.available)
      .slice(0, 6)
      .map(s => s.slug);

    console.log(`✅ Generated ${availableSuggestions.length} available suggestions:`, availableSuggestions);

    return NextResponse.json({
      original: originalSlug,
      suggestions: availableSuggestions,
      total_checked: checked,
      message: availableSuggestions.length > 0 
        ? `Found ${availableSuggestions.length} available alternatives`
        : "No immediate alternatives found. Try a different name."
    });

  } catch (error) {
    console.error("Suggestion generation error:", error);
    return NextResponse.json(
      { 
        error: "Failed to generate suggestions",
        suggestions: []
      },
      { status: 500 }
    );
  }
}