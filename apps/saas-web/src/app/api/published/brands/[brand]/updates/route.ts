import type { NextRequest } from "next/server";
import { buildPublishedUpdates } from "@/lib/published-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string }> }
) {
  const { brand } = await params;
  return buildPublishedUpdates({ request, brandSlug: brand });
}
