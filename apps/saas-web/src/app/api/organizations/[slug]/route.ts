import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  
  const resolvedParams = await params;
const { slug } = await params;
  
  const organization = {
    id: "demo-id",
    name: `${slug} Organization`,
    slug: slug,
    kinde_org_id: `${slug}-kinde-id`,
    industry: "technology",
    team_size: "1-5",
    storage_used: 0,
    storage_limit: 5368709120,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return NextResponse.json({ organization });
}