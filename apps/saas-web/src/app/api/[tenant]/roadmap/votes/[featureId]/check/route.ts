import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; featureId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { featureId } = resolvedParams;
    const body = await request.json();
    const { voterIdentifier } = body;

    // Validate required fields
    if (!featureId || !voterIdentifier) {
      return NextResponse.json(
        { message: 'Feature ID and voter identifier are required' },
        { status: 400 }
      );
    }

    // Check if user has voted for this feature
    const { data: existingVote } = await supabaseServer
      .from('feature_votes')
      .select('id')
      .eq('feature_request_id', featureId)
      .eq('voter_identifier', voterIdentifier)
      .single();

    return NextResponse.json({
      hasVoted: !!existingVote
    });

  } catch (error) {
    console.error('Failed to check vote status:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}