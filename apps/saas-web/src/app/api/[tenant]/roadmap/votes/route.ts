import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    const { featureRequestId, voterIdentifier, voterName } = body;

    // Validate required fields
    if (!featureRequestId || !voterIdentifier) {
      return NextResponse.json(
        { message: 'Feature request ID and voter identifier are required' },
        { status: 400 }
      );
    }

    // Check if the feature request exists and is approved
    const { data: featureRequest, error: featureError } = await supabaseServer
      .from('feature_requests')
      .select('id, status')
      .eq('id', featureRequestId)
      .eq('status', 'approved')
      .single();

    if (featureError || !featureRequest) {
      return NextResponse.json(
        { message: 'Feature request not found or not available for voting' },
        { status: 404 }
      );
    }

    // Check if user has already voted
    const { data: existingVote } = await supabaseServer
      .from('feature_votes')
      .select('id')
      .eq('feature_request_id', featureRequestId)
      .eq('voter_identifier', voterIdentifier)
      .single();

    if (existingVote) {
      return NextResponse.json(
        { message: 'You have already voted for this feature' },
        { status: 409 }
      );
    }

    // Insert the vote
    const { data: vote, error: voteError } = await supabaseServer
      .from('feature_votes')
      .insert([
        {
          feature_request_id: featureRequestId,
          voter_identifier: voterIdentifier,
          voter_name: voterName || null
        }
      ])
      .select()
      .single();

    if (voteError) {
      console.error('Failed to create vote:', voteError);
      return NextResponse.json(
        { message: 'Failed to register vote' },
        { status: 500 }
      );
    }

    // Get updated vote count
    const { data: updatedFeature } = await supabaseServer
      .from('feature_requests')
      .select('vote_count')
      .eq('id', featureRequestId)
      .single();

    return NextResponse.json({
      success: true,
      message: 'Vote registered successfully',
      vote,
      voteCount: updatedFeature?.vote_count || 0
    });

  } catch (error) {
    console.error('Failed to register vote:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    const { featureRequestId, voterIdentifier } = body;

    // Validate required fields
    if (!featureRequestId || !voterIdentifier) {
      return NextResponse.json(
        { message: 'Feature request ID and voter identifier are required' },
        { status: 400 }
      );
    }

    // Find and delete the vote
    const { data: deletedVote, error: deleteError } = await supabaseServer
      .from('feature_votes')
      .delete()
      .eq('feature_request_id', featureRequestId)
      .eq('voter_identifier', voterIdentifier)
      .select()
      .single();

    if (deleteError || !deletedVote) {
      return NextResponse.json(
        { message: 'Vote not found or already removed' },
        { status: 404 }
      );
    }

    // Get updated vote count
    const { data: updatedFeature } = await supabaseServer
      .from('feature_requests')
      .select('vote_count')
      .eq('id', featureRequestId)
      .single();

    return NextResponse.json({
      success: true,
      message: 'Vote removed successfully',
      voteCount: updatedFeature?.vote_count || 0
    });

  } catch (error) {
    console.error('Failed to remove vote:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}