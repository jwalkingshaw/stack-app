import type { NextRequest } from "next/server";
import { buildPublishedPublishDetail } from "@/lib/published-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string; publishId: string }> }
) {
  const { brand, publishId } = await params;
  return buildPublishedPublishDetail({ request, brandSlug: brand, publishId });
}
