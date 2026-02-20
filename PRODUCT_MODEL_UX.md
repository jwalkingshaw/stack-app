# Product Model UX (Families -> Groups -> Attributes)

This UX assumes:
- Product families define the structure of a product type.
- Attribute groups organize attributes.
- Attributes are inheritable by default (parent provides defaults unless variant overrides).

## Core objects
- Family: a product type (e.g., "Protein Powder", "Energy Drink").
- Group: a logical section of attributes (e.g., "Nutrition", "Regulatory", "Marketing").
- Attribute: a field with data type + rules (e.g., "Ingredients", "Net Weight", "Hero Image").
- Parent: the base product in a family.
- Variant: a child SKU that inherits attributes from parent and overrides as needed.

## UX flow: Build the product model
1) Create family
   - Name, description, default status, primary channel/market/locale.
2) Add attribute groups
   - Group name + description; order the groups.
3) Add attributes to groups
   - Data type, required, channel/market/locale flags, validation, default value.
4) Mark variant-driving attributes (variant axes)
   - Pick which attributes define variants (Size, Flavor, Pack).
5) Save family
   - System generates a family model summary + completeness rules.

## UX flow: Create a parent product
1) Create product -> select family
2) System shows group sections with attributes
3) Parent attributes are the source of defaults for all variants
4) "Completeness" shows required attributes filled for the parent

## UX flow: Create variants (matrix)
1) From parent, open "Variants" -> "Build Variant Matrix"
2) Select values for variant-driving attributes
3) System generates variant combinations (matrix)
4) User edits SKU, name, barcode, price, etc.
5) Create variants in bulk

## UX flow: Edit variants (inherit/override)
Each attribute on a variant has:
- Inherit toggle (default on)
- Override value (only active if inherit is off)
- Reset to parent action
- Parent value preview

Visual rules:
- Inherited values show a small "Inherited" badge
- Overridden values show a small "Override" badge
- Variant-driving attributes are locked and labeled "Variant axis"

## UX flow: Assets in product pages
Parent Assets tab
- Show assets linked to parent
- "Apply to children" option for each asset
- Asset roles (Hero, Gallery, Lifestyle, Packaging, Documents)
Variant Assets tab
- Show assets that are inherited from parent
- Show assets linked directly to the variant
- Toggle to view "Parent only / Variant only / All"

## UX flow: Retailer view (read-only)
- Product summary + attribute groups (read-only)
- Download pack (selected asset roles)
- Audit: last updated, who changed, version notes
- Filters by market/channel/locale

## API mapping (current)
- Family -> `/api/[tenant]/product-families`
- Group assignments -> `/api/[tenant]/product-families/[familyId]/field-groups`
- Variant attributes -> `/api/[tenant]/product-families/[familyId]/variant-attributes`
- Products -> `/api/[tenant]/products`
- Variants -> `/api/[tenant]/products/[productId]/variants`
- Asset links -> `/api/[tenant]/product-links` and `/api/[tenant]/assets`

