import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@tradetool/database";
import { kindeAPI } from "@/lib/kinde-management";
import { syncKindeBillingRoleForMember } from "@/lib/kinde-billing-role-sync";
import { ensureCoreBasicInformationFields } from "@/lib/pim-bootstrap";

const supabase = createServerClient();
const db = new DatabaseQueries(supabase);

const DEFAULT_MARKET_COUNTRY_CODE = "US";

const MARKET_PRESETS: Record<string, { currencyCode: string | null; timezone: string | null }> = {
  AU: { currencyCode: "AUD", timezone: "Australia/Sydney" },
  BR: { currencyCode: "BRL", timezone: "America/Sao_Paulo" },
  CA: { currencyCode: "CAD", timezone: "America/Toronto" },
  CH: { currencyCode: "CHF", timezone: "Europe/Zurich" },
  CN: { currencyCode: "CNY", timezone: "Asia/Shanghai" },
  DE: { currencyCode: "EUR", timezone: "Europe/Berlin" },
  ES: { currencyCode: "EUR", timezone: "Europe/Madrid" },
  FR: { currencyCode: "EUR", timezone: "Europe/Paris" },
  GB: { currencyCode: "GBP", timezone: "Europe/London" },
  HK: { currencyCode: "HKD", timezone: "Asia/Hong_Kong" },
  ID: { currencyCode: "IDR", timezone: "Asia/Jakarta" },
  IE: { currencyCode: "EUR", timezone: "Europe/Dublin" },
  IN: { currencyCode: "INR", timezone: "Asia/Kolkata" },
  IT: { currencyCode: "EUR", timezone: "Europe/Rome" },
  JP: { currencyCode: "JPY", timezone: "Asia/Tokyo" },
  KR: { currencyCode: "KRW", timezone: "Asia/Seoul" },
  MX: { currencyCode: "MXN", timezone: "America/Mexico_City" },
  MY: { currencyCode: "MYR", timezone: "Asia/Kuala_Lumpur" },
  NL: { currencyCode: "EUR", timezone: "Europe/Amsterdam" },
  NZ: { currencyCode: "NZD", timezone: "Pacific/Auckland" },
  PH: { currencyCode: "PHP", timezone: "Asia/Manila" },
  SA: { currencyCode: "SAR", timezone: "Asia/Riyadh" },
  SE: { currencyCode: "SEK", timezone: "Europe/Stockholm" },
  SG: { currencyCode: "SGD", timezone: "Asia/Singapore" },
  TH: { currencyCode: "THB", timezone: "Asia/Bangkok" },
  TR: { currencyCode: "TRY", timezone: "Europe/Istanbul" },
  TW: { currencyCode: "TWD", timezone: "Asia/Taipei" },
  US: { currencyCode: "USD", timezone: "America/New_York" },
  VN: { currencyCode: "VND", timezone: "Asia/Ho_Chi_Minh" },
  ZA: { currencyCode: "ZAR", timezone: "Africa/Johannesburg" },
};

async function ensureOrganizationLocale(params: {
  organizationId: string;
  localeCode: string;
  localeName: string;
}) {
  const normalizedCode = params.localeCode.trim();

  const { data: existingLocale, error: existingLocaleError } = await (supabase as any)
    .from("locales")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("code", normalizedCode)
    .maybeSingle();

  if (existingLocaleError) {
    throw new Error("Failed to verify default locale.");
  }

  if (existingLocale) {
    return existingLocale;
  }

  const { data: createdLocale, error: createLocaleError } = await (supabase as any)
    .from("locales")
    .insert({
      organization_id: params.organizationId,
      code: normalizedCode,
      name: params.localeName,
      is_active: true,
    })
    .select("id")
    .single();

  if (createLocaleError || !createdLocale) {
    throw new Error("Failed to create default locale.");
  }

  return createdLocale;
}

async function seedDefaultMarketForWorkspace(params: {
  organizationId: string;
  countryCode: string;
}) {
  const normalizedCountryCode = params.countryCode.trim().toUpperCase();
  const { data: country, error: countryError } = await (supabase as any)
    .from("countries")
    .select("code, name")
    .eq("code", normalizedCountryCode)
    .maybeSingle();

  if (countryError || !country) {
    throw new Error("Selected default market country is not supported.");
  }

  const preset = MARKET_PRESETS[normalizedCountryCode] || { currencyCode: null, timezone: null };

  const { data: market, error: marketError } = await (supabase as any)
    .from("markets")
    .insert({
      organization_id: params.organizationId,
      code: normalizedCountryCode,
      name: country.name,
      is_default: true,
      currency_code: preset.currencyCode,
      timezone: preset.timezone,
      is_active: true,
    })
    .select("id")
    .single();

  if (marketError || !market) {
    throw new Error("Failed to create default market.");
  }

  const { data: countryLocales, error: countryLocalesError } = await (supabase as any)
    .from("country_locales")
    .select("locale_code, locale_name, is_primary")
    .eq("country_code", normalizedCountryCode)
    .order("is_primary", { ascending: false })
    .order("locale_name", { ascending: true });

  if (countryLocalesError) {
    throw new Error("Failed to load primary locale for default market.");
  }

  const primaryLocale = countryLocales?.[0];
  if (!primaryLocale) {
    return;
  }

  const locale = await ensureOrganizationLocale({
    organizationId: params.organizationId,
    localeCode: primaryLocale.locale_code,
    localeName: primaryLocale.locale_name,
  });

  const { error: marketLocaleError } = await (supabase as any)
    .from("market_locales")
    .upsert(
      {
        market_id: market.id,
        locale_id: locale.id,
        is_active: true,
      },
      { onConflict: "market_id,locale_id" }
    );

  if (marketLocaleError) {
    throw new Error("Failed to assign default locale to default market.");
  }

  const { error: updateMarketError } = await (supabase as any)
    .from("markets")
    .update({ default_locale_id: locale.id })
    .eq("id", market.id);

  if (updateMarketError) {
    throw new Error("Failed to finalize default market locale settings.");
  }
}

// POST /api/workspaces/create
// Create a new workspace
export async function POST(request: NextRequest) {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      name,
      slug,
      industry,
      teamSize,
      organization_type = 'brand',
      partner_category = null,
      default_market_country_code,
    } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    const normalizedDefaultMarketCountryCode =
      typeof default_market_country_code === "string" && default_market_country_code.trim().length > 0
        ? default_market_country_code.trim().toUpperCase()
        : DEFAULT_MARKET_COUNTRY_CODE;

    if (!/^[A-Z]{2}$/.test(normalizedDefaultMarketCountryCode)) {
      return NextResponse.json(
        { error: "default_market_country_code must be a 2-letter country code." },
        { status: 400 }
      );
    }

    // Validate organization_type
    if (!['brand', 'partner'].includes(organization_type)) {
      return NextResponse.json(
        { error: "Organization type must be 'brand' or 'partner'" },
        { status: 400 }
      );
    }

    const normalizedPartnerCategory =
      typeof partner_category === "string" && partner_category.trim().length > 0
        ? partner_category.trim().toLowerCase()
        : null;
    const validPartnerCategories = ["retailer", "distributor", "wholesaler"];

    if (organization_type === "partner" && !normalizedPartnerCategory) {
      return NextResponse.json(
        { error: "Partner business type is required for partner workspaces." },
        { status: 400 }
      );
    }

    if (
      normalizedPartnerCategory &&
      !validPartnerCategories.includes(normalizedPartnerCategory)
    ) {
      return NextResponse.json(
        { error: "partner_category must be one of: retailer, distributor, wholesaler" },
        { status: 400 }
      );
    }

    console.log('🏢 Creating workspace:', { name, slug, organization_type, userId: user.id });

    let organization;
    let kindeOrgId;

    try {
      // Step 1: Create organization in Kinde
      console.log('Creating organization in Kinde:', { name, slug });
      const kindeOrg = await kindeAPI.createOrganization({
        name,
        code: `org_${crypto.randomUUID()}`,
        external_id: slug,
      });

      if (!kindeOrg || !kindeOrg.code) {
        throw new Error('Failed to get Kinde organization ID');
      }

      kindeOrgId = kindeOrg.code;
      console.log('✅ Kinde organization created:', kindeOrgId);

      // Step 2: Create organization in Supabase
      organization = await db.createWorkspace({
        name,
        slug,
        kindeOrgId,
        industry,
        teamSize,
        organizationType: organization_type,
        partnerCategory:
          organization_type === "partner"
            ? (normalizedPartnerCategory as "retailer" | "distributor" | "wholesaler")
            : null,
      });

      if (!organization) {
        throw new Error('Failed to create workspace in Supabase');
      }

      console.log('✅ Supabase workspace created:', organization.id);
      await ensureCoreBasicInformationFields(supabase as any, organization.id);
      await seedDefaultMarketForWorkspace({
        organizationId: organization.id,
        countryCode: normalizedDefaultMarketCountryCode,
      });

      // Step 3: Add user to organization in Kinde
      if (user.id && kindeOrgId) {
        try {
          console.log('Adding user to organization in Kinde');
          await kindeAPI.addUserToOrganization(kindeOrgId, user.id);
          console.log('✅ User successfully added to organization in Kinde');
        } catch (error) {
          console.warn('❌ Failed to add user to organization in Kinde:', error);
          throw new Error('Failed to add user to organization in Kinde');
        }
      }

      // Step 4: Add user to organization_members table as owner
      try {
        console.log('Adding user to organization_members table as workspace owner');
        
        // Set database context for RLS
        await (supabase as any).rpc('set_config', {
          setting_name: 'app.current_user_id',
          new_value: (user as any).id,
          is_local: true
        });
        
        await (supabase as any).rpc('set_config', {
          setting_name: 'app.current_org_code',
          new_value: kindeOrgId,
          is_local: true
        });

        const { data: memberData, error: memberError } = await (supabase as any)
          .from('organization_members')
          .insert({
            organization_id: organization.id,
            kinde_user_id: (user as any).id,
            email: (user as any).email,
            role: 'owner',
            status: 'active',
            invited_by: (user as any).id  // Self-reference: workspace owner invited themselves
          })
          .select()
          .single();

        if (memberError) {
          console.error('Failed to add user to organization_members:', memberError);
          throw new Error('Failed to create workspace member record');
        }

        console.log('✅ User successfully added to organization_members as owner:', memberData.id);
        await syncKindeBillingRoleForMember({
          kindeOrgId,
          kindeUserId: (user as any).id,
          appRole: 'owner',
          status: 'active',
          context: 'workspace_create',
        });
      } catch (error) {
        console.error('Error adding user to organization_members:', error);
        throw new Error('Failed to create workspace member record');
      }

    } catch (error) {
      console.error('Error during workspace creation:', error);
      
      // Rollback: Clean up created resources
      if (organization && organization.id) {
        try {
          // Clean up organization_members
          await supabase
            .from('organization_members')
            .delete()
            .eq('organization_id', organization.id);
          
          // Clean up organization
          await supabase
            .from('organizations')
            .delete()
            .eq('id', organization.id);
        } catch (cleanupError) {
          console.error('Failed to cleanup after error:', cleanupError);
        }
      }

      if (kindeOrgId) {
        try {
          await kindeAPI.deleteOrganization(kindeOrgId);
        } catch (kindeCleanupError) {
          console.error('Failed to cleanup Kinde organization:', kindeCleanupError);
        }
      }

      if (error instanceof Error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      } else {
        return NextResponse.json(
          { error: "Failed to create workspace" },
          { status: 500 }
        );
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          type: organization.type,
          organization_type: organization.organizationType || organization.type,
          partner_category: organization.partnerCategory ?? null,
        }
      },
      message: "Workspace created successfully"
    });

  } catch (error) {
    console.error("Workspace creation error:", error);
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}
