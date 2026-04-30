import type { NextRequest } from "next/server";
import { buildPublishedAssetDetail } from "@/lib/published-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string; assetId: string }> }
) {
  const { brand, assetId } = await params;
  return buildPublishedAssetDetail({ request, brandSlug: brand, assetId });
}
