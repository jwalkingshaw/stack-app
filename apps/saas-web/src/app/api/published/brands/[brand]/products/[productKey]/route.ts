import type { NextRequest } from "next/server";
import { buildPublishedProduct } from "@/lib/published-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string; productKey: string }> }
) {
  const { brand, productKey } = await params;
  return buildPublishedProduct({ request, brandSlug: brand, productKey });
}
