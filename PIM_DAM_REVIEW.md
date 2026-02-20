# PIM/DAM Review (Attributes Terminology)

This review uses the product family -> groups -> attributes model.
"Attributes" are the inheritable fields (formerly "product fields" in the schema).

## Current terminology map (UI language -> schema/API)
- Product family -> `product_families` + family APIs under `/api/[tenant]/product-families`
- Attribute group -> `field_groups` + `product_field_group_assignments`
- Attribute -> `product_fields`
- Attribute values -> `product_field_values`
- Family -> group assignment -> `product_family_field_groups`
- Family -> variant attribute configuration -> `product_family_variant_attributes` + `get_family_variant_attributes`
- Variant -> `products` with `type = 'variant'` and `parent_id` set
- Parent -> `products` with `type = 'parent'`
- Parent/variant inheritance -> resolved in UI by merging parent + variant values
- Asset links -> `product_asset_links`

## Key findings (renamed to attributes)
- High: Variant inheritance is not explicit; the UI currently reuses the parent value as the editable value without an "inherit/override" control. This makes it easy to accidentally override and hard to keep true inheritance.
- High: Product/variant asset relationships exist in data but are not visible or manageable in product pages; "Media Assets" and "Assets" sections are placeholders.
- Medium: Variant attribute values are stored in both `products.variant_attributes` and `product_field_values`, with the API merging them. This risks conflicting sources of truth.
- Low: Asset "applies to children" is captured during upload, but no logic applies it to children or uses it in product views.

## Design implications
- Attribute inheritance must be explicit at the field level (inherit/override + reset to parent).
- Parent and variant assets must be visible in the product views, with clear propagation rules.
- The attribute source of truth should be single-path (`product_field_values` preferred).
- Retailer view needs read-only product + asset access with change history and usage rights.

