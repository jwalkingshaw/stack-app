import type { NextRequest } from "next/server";
import { buildPublishedAssets } from "@/lib/published-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  const { brand } = await params;
  return buildPublishedAssets({ request, brandSlug: brand });
}
