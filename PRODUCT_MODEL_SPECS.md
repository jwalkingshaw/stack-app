# Product Model Screens (Families -> Groups -> Attributes)

Goal: Provide a first-class "Product Model" layer that defines variant axes and enables
variant matrix generation. Parent is the model; variants are SKUs.

## 1) Family Builder (Product Model)
Location: Settings -> Product Models (Families)

Primary actions:
- Create family
- Edit family
- Manage attribute groups
- Manage attributes
- Configure variant axes

### Screen layout
- Left nav: list of families (search + "New family")
- Main panel: tabs
  - Overview
  - Groups
  - Attributes
  - Variant Axes
  - Rules & Completeness

### Tab: Overview
Fields:
- Family name (required)
- Description
- Default status (Draft/Active)
- Default market/channel/locale (optional)

### Tab: Groups
- Add group (name, description, order)
- Reorder groups (drag)
- Group list with "Edit" and "Delete"

### Tab: Attributes
Table columns:
- Attribute name
- Code
- Type
- Group
- Required
- Channel/Market/Locale flags
- Default value
- Actions (Edit, Archive)

Attribute editor (drawer):
- Name
- Code (slug)
- Type (text, textarea, select, number, measurement, price, image, file, table, etc.)
- Group
- Required
- Channelable, Market-restricted, Localizable toggles
- Validation rules
- Default value
- Description/help text

### Tab: Variant Axes
Purpose: select which attributes define variants.

UI:
- Multi-select list of attributes that are allowed as variant axes
- Constraints:
  - Only select, number, text with predefined values should be allowed
  - Max axes (e.g., 2 or 3) enforced by family config
- Preview: shows axis names and allowed values (if value list exists)

### Tab: Rules & Completeness
- Required attributes by channel/market/locale
- Required asset roles (optional)
- Completeness score rules

## 2) Parent Product: Variant Matrix Builder
Location: Parent product -> Variants tab -> "Build Variant Matrix"

### Steps
1) Pick values for each axis
   - For each axis: list of allowed values (tag select)
2) Generate matrix
   - Table with all combinations
   - Columns: SKU, Variant Name, axis values, barcode, status
3) Bulk edit
   - Prefix/suffix rules for SKU + name
   - Bulk set status
4) Create variants

### UX notes
- Show count of combinations before generating
- Allow "Save as template" for reuse
- Warn if any combinations already exist

## 3) Variant Detail: Inheritance Controls (per attribute)
Location: Variant product -> Attributes tab

Each attribute row:
- Inherit toggle (default on)
- Parent value preview
- Override input (enabled only if inherit off)
- Reset to parent

Labels:
- "Inherited" badge when inherit on
- "Override" badge when inherit off
- "Variant axis" badge for axis attributes (read-only)

## 4) Minimal API changes (to support MVP)
### Variant axes in family
- Store axis list in `product_family_variant_attributes`
- Add "allowed values" to attribute options if not already present

### Variant matrix generation
- New endpoint: `POST /api/[tenant]/products/[productId]/variants/matrix`
  - Input: { axes: { attributeCode: values[] }, baseSku?, baseName? }
  - Output: combinations preview (no writes)

### Bulk create variants
- Reuse existing `POST /api/[tenant]/products/[productId]/variants/bulk`
  - Accept `variant_attribute_values` keyed by attribute code

### Inheritance model (backend)
- Variant inherits when no value present in `product_field_values`
- Do not copy parent values to variant unless override is explicit

## 5) Data model alignment (current)
- Families -> `product_families`
- Groups -> `field_groups` and `product_family_field_groups`
- Attributes -> `product_fields`
- Attribute values -> `product_field_values`
- Variant axes -> `product_family_variant_attributes`

