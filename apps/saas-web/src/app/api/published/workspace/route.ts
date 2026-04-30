import type { NextRequest } from "next/server";
import { buildPublishedWorkspace } from "@/lib/published-api";

export async function GET(request: NextRequest) {
  return buildPublishedWorkspace(request);
}
