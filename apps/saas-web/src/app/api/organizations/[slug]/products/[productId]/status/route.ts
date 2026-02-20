import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { applyRLSContext } from "@/lib/rls-context";
import { evaluateProductCompleteness } from "@/lib/family-attributes";
import { getChannelScopedProductIds, resolveProductChannelScope } from "@/lib/product-channel-scope";

const ALLOWED_STATUS = [
  "Draft",
  "Enrichment",
  "Review",
  "Active",
  "Discontinued",
  "Archived",
] as const;

type ProductStatus = (typeof ALLOWED_STATUS)[number];

const isProductStatus = (value: string): value is ProductStatus =>
  (ALLOWED_STATUS as readonly string[]).includes(value);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; productId: string }> }
) {
  try {
    const { slug, productId } = await params;
    const payload = await request.json();
    const marketId = payload?.marketId ?? null;
    const channelId = payload?.channelId ?? null;

    const status = payload?.status;
    if (typeof status !== "string" || !isProductStatus(status)) {
      return NextResponse.json(
        { error: "Invalid product status" },
        { status: 400 }
      );
    }

    const db = new DatabaseQueries(supabaseServer);
    const auth = new AuthService(db);

    const user = await auth.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await auth.getCurrentOrganization(slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const [legacyCanEdit, canChangePublishState] = await Promise.all([
      auth.canEditProducts(user.id, organization.id),
      auth.hasScopedPermission({
        userId: user.id,
        organizationId: organization.id,
        permissionKey: ScopedPermission.ProductPublishState,
        marketId,
        channelId,
      }),
    ]);

    if (!legacyCanEdit && !canChangePublishState) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    let channelProductIds: string[] | null = null;
    if (channelId || !legacyCanEdit) {
      const channelScope = await resolveProductChannelScope({
        authService: auth,
        supabase: supabaseServer as any,
        userId: user.id,
        organizationId: organization.id,
        permissionKey: ScopedPermission.ProductPublishState,
        channelId,
      });
      if (!channelScope.ok) {
        return channelScope.response;
      }
      channelProductIds = await getChannelScopedProductIds({
        supabase: supabaseServer as any,
        organizationId: organization.id,
        channelId: channelScope.channelId,
      });
      if (channelProductIds && channelProductIds.length === 0) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
    }

    await applyRLSContext(supabaseServer, {
      userId: user.id,
      organizationId: organization.id,
      organizationCode: organization.kindeOrgId,
    });

    if (channelProductIds) {
      const { data: targetProduct, error: targetProductError } = await (supabaseServer as any)
        .from("products")
        .select("id")
        .eq("id", productId)
        .eq("organization_id", organization.id)
        .single();

      if (targetProductError || !targetProduct || !channelProductIds.includes(targetProduct.id)) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
    }

    if (status === "Active") {
      const { data: product, error: productError } = await (supabaseServer as any)
        .from("products")
        .select("id, family_id, sku, barcode")
        .eq("id", productId)
        .eq("organization_id", organization.id)
        .single();

      if (productError || !product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      const { data: familyRules } = await (supabaseServer as any)
        .from("product_families")
        .select("require_sku_on_active, require_barcode_on_active")
        .eq("id", product.family_id)
        .single();

      const requireSku = familyRules?.require_sku_on_active ?? true;
      const requireBarcode = familyRules?.require_barcode_on_active ?? false;

      if (requireSku && (!product.sku || String(product.sku).trim() === "")) {
        return NextResponse.json(
          { error: "Active products must have a real SKU." },
          { status: 400 }
        );
      }

      if (requireBarcode && (!product.barcode || String(product.barcode).trim() === "")) {
        return NextResponse.json(
          { error: "Active products must have a barcode." },
          { status: 400 }
        );
      }

      const completeness = await evaluateProductCompleteness(
        organization.id,
        product.id,
        product.family_id
      );

      if (!completeness.isComplete) {
        return NextResponse.json(
          {
            error: "Product is missing required attributes",
            missingAttributes: completeness.missingAttributes,
          },
          { status: 400 }
        );
      }
    }

    const updated = await db.updateProductStatus(
      organization.id,
      productId,
      status,
      user.id
    );

    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updated_at,
      lastModifiedBy: updated.last_modified_by,
    });
  } catch (error) {
    console.error("Failed to update product status:", error);
    return NextResponse.json(
      { error: "Failed to update product status" },
      { status: 500 }
    );
  }
}
