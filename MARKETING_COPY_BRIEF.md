# Stackcess Marketing Copy Brief

Last updated: 2026-05-04

## Review findings

1. High: The repo references a separate public marketing site in [README.md](/abs/path/c:/Users/jason/tradetool/README.md), but `apps/public-site` is not present in this checkout. That means the main website copy cannot be updated here unless those files live in another repo.
2. Medium: The current root app in [apps/saas-web/src/app/page.tsx](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/app/page.tsx) is authenticated routing, not a public homepage. From this checkout, the strongest pre-signup copy surface is the auth flow.
3. Medium: Existing sign-up/login language is generic and undersells the product. It mentions products, assets, and partner distribution, but not AI localization, the portal, unified PIM + DAM, or bulk workflows.

## What the platform actually is

Stackcess is a product content operations platform for sales and marketing teams.

It combines:
- PIM for structured product data, variants, readiness, and bulk updates
- DAM for governed asset storage, linking, versioning, and reuse
- AI-assisted localization for adapting content by locale with terminology and compliance guidance
- Partner portal syndication for sharing approved product content with retailers, distributors, and agencies

This is not best framed as a generic headless CMS. The product is closer to:
- a unified PIM + DAM
- with AI localization
- and partner-facing syndication / portal delivery

## Product truths pulled from the code

### 1. AI localization is real and should be a lead feature

Evidence:
- [apps/saas-web/src/app/[tenant]/settings/components/LocalizationHome.tsx](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/app/[tenant]/settings/components/LocalizationHome.tsx) shows locale governance, AI adaptation, glossaries, and translation activity.
- [apps/saas-web/src/app/api/[tenant]/ai/write-assist/route.ts](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/app/api/[tenant]/ai/write-assist/route.ts) applies brand instructions, preferred tone, and locale regulatory rules to generated copy.

Plain-English message:
- Adapt product content for each market with AI.
- Keep terminology consistent with glossaries.
- Generate copy with locale-aware compliance guidance built into the workflow.

### 2. Portal is a launch-defining workflow, not a minor feature

Evidence:
- [apps/saas-web/src/app/api/[tenant]/syndication/runs/route.ts](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/app/api/[tenant]/syndication/runs/route.ts) creates syndication runs for `portal`, `file_export`, and `direct_channel`.
- [apps/saas-web/src/app/[tenant]/settings/components/OutputProfilesSettings.tsx](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/app/[tenant]/settings/components/OutputProfilesSettings.tsx) describes the Portal as a partner-facing profile and states that markets, locales, and scopes control what content is returned.
- [apps/saas-web/src/lib/output-profile-templates.ts](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/lib/output-profile-templates.ts) includes a dedicated portal content model and field mappings.

Plain-English message:
- Brands create approved content once, then syndicate it to partner portals, retailers, distributors, and agencies.
- The Portal is a controlled destination for partner-ready content, not just a file dump.

### 3. “One system” is credible if you say PIM + DAM clearly

Evidence:
- [apps/saas-web/src/app/[tenant]/team/TeamClient.tsx](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/app/[tenant]/team/TeamClient.tsx) defines separate permission models for `Products (PIM)` and `Assets (DAM)`.
- [apps/saas-web/src/components/field-types/FileField.tsx](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/components/field-types/FileField.tsx) states that product fields store references to DAM assets by asset ID.
- [apps/saas-web/src/lib/output-profile-templates.ts](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/lib/output-profile-templates.ts) explains that product channel slots point to DAM assets rather than copying files.
- [apps/saas-web/src/components/products/ProductMediaCenter.tsx](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/components/products/ProductMediaCenter.tsx) shows product-level media, slot assignment, variants, and destination-specific asset handling in one workflow.

Plain-English message:
- Product data and approved assets live in one operating system.
- Teams manage structured product information and linked assets together.
- The same product can use different approved assets for different channels without duplicating files.

### 4. Bulk product management is strong and should be stated explicitly

Evidence:
- [apps/saas-web/src/components/products/ProductDataImportDialog.tsx](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/components/products/ProductDataImportDialog.tsx) supports template download, CSV upload, validation, and import jobs.
- [apps/saas-web/src/app/api/[tenant]/products/bulk-field-update/route.ts](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/app/api/[tenant]/products/bulk-field-update/route.ts) handles multi-product field changes in one request.
- [apps/saas-web/src/app/api/[tenant]/products/[productId]/variants/bulk/route.ts](/abs/path/c:/Users/jason/tradetool/apps/saas-web/src/app/api/[tenant]/products/[productId]/variants/bulk/route.ts) supports bulk variant creation and updates.

Plain-English message:
- Import, enrich, update, and structure products in bulk.
- Manage variants and large catalogs without spreadsheet chaos.

## Audience

Primary audience:
- Sales teams
- Marketing teams
- Brand operations
- Trade marketing
- Channel marketing

Best-fit organizations:
- Brands that sell through retail, distributor, wholesale, and partner networks
- Teams that need product content, assets, and partner delivery in one workflow
- Organizations expanding across markets, languages, and compliance requirements

## Positioning recommendation

Recommended category line:
- Unified PIM + DAM for partner-ready product content

Recommended fuller positioning:
- Stackcess helps sales and marketing teams manage product content and assets in one system, adapt them for every market with AI, and syndicate approved content to partners globally.

## Category language to borrow

From PIM vendors:
- source of truth
- channel-ready content
- product data enrichment
- syndication
- retailer requirements
- readiness
- variants
- bulk updates

From DAM vendors:
- manage and distribute assets
- approved content
- brand consistency
- centralized asset governance
- asset reuse

From headless CMS / composable content vendors:
- structured content
- multi-market content
- localization workflows
- publish everywhere

## Language to avoid

Avoid:
- “headless CMS” as the main category claim
- vague phrases like “streamline workflows” with no outcome
- “all-in-one marketing platform”
- “AI-powered” with no explanation

Prefer:
- unified PIM + DAM
- AI localization and compliance guidance
- partner portal syndication
- channel-ready product content
- one source of truth for product content and assets

## Messaging hierarchy

### Core value proposition

One system for product content, assets, and partner syndication.

### Support message

Create channel-ready product content, adapt it for each market with AI, and share it with retailers, distributors, and agencies from one platform.

### Key pillars

1. AI Localization
- Adapt content for different markets and languages faster
- Apply brand tone, glossary terms, and compliance-aware guidance

2. Portal Syndication
- Create partner-ready content once
- Syndicate it directly to portal experiences and downstream partners globally

3. Unified PIM + DAM
- Manage structured product data and approved assets together
- Link the right asset to the right product and channel without duplication

4. Bulk Product Management
- Import and update products in bulk
- Manage variants, readiness, and large catalogs efficiently

## Recommended homepage copy

### Hero

Headline:
One system for product content, assets, and partner syndication

Subheadline:
Stackcess brings PIM and DAM together so sales and marketing teams can create channel-ready product content, adapt it for every market with AI, and share it with retailers, distributors, and agencies from one place.

Primary CTA:
Create free account

Secondary CTA:
Explore the platform

### Proof strip / summary bullets

- Unified PIM + DAM
- AI localization with compliance guidance
- Partner portal syndication
- Bulk product and variant management

### Feature section copy

AI Localization
Adapt product content for each market with AI. Apply brand tone, terminology, and locale-aware compliance guidance without rewriting everything manually.

Portal
Create approved product content once and syndicate it to partners globally. Give retailers, distributors, and agencies access to the content they need through a controlled partner portal.

One System
Bring your PIM and DAM together. Manage structured product data and approved assets in one place, then connect the right content to the right channel.

Bulk Product Management
Import, enrich, and update large catalogs faster. Manage variants, field updates, and readiness workflows without relying on disconnected spreadsheets.

### CTA section

Headline:
Start with a free account

Body:
Explore how Stackcess helps your team organize product content, localize faster, and syndicate approved assets and information to every partner channel.

CTA:
Create free account

## Short positioning options

Option 1:
Unified PIM + DAM for sales and marketing teams

Option 2:
Manage product content, assets, and partner syndication in one place

Option 3:
AI-localized product content for every market and partner channel

## Suggested copywriter brief

Ask the copywriter to write for:
- sales and marketing teams, not developers
- multi-market brands, not single-channel ecommerce stores
- partner distribution use cases, not just internal asset management

The copy should emphasize:
- faster partner-ready content creation
- less manual rework across markets
- one source of truth across product data and assets
- controlled syndication to retailers, distributors, and agencies
- low-friction free account signup

## Recommended competitive framing

Use this implied comparison:
- more operational and partner-ready than a headless CMS
- more content-centric than a traditional PIM alone
- more structured and syndication-ready than a DAM alone

Simple framing line:
- Stackcess combines the structure of a PIM, the governance of a DAM, and the reach of a partner portal in one system.
