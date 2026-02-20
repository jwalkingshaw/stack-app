import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;

    // Fetch approved feature requests, sorted by vote count descending
    const { data: featureRequests, error } = await supabaseServer
      .from('feature_requests')
      .select('*')
      .eq('status', 'approved')
      .order('vote_count', { ascending: false });

    if (error) {
      console.error('Failed to fetch feature requests:', error);
      return NextResponse.json(
        { message: 'Failed to fetch feature requests' },
        { status: 500 }
      );
    }

    return NextResponse.json(featureRequests || []);
  } catch (error) {
    console.error('Failed to fetch feature requests:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    const { name, email, title, description, marketingOptIn } = body;

    // Validate required fields
    if (!name || !email || !title || !description) {
      return NextResponse.json(
        { message: 'Name, email, title, and description are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    // Start a transaction to handle both operations
    const supabase = supabaseServer;

    // Insert the feature request
    const { data: featureRequest, error: featureError } = await supabase
      .from('feature_requests')
      .insert([
        {
          title: title.trim(),
          description: description.trim(),
          submitter_name: name.trim(),
          submitter_email: email.toLowerCase().trim(),
          status: 'pending', // Requires admin approval
        }
      ])
      .select()
      .single();

    if (featureError) {
      console.error('Failed to create feature request:', featureError);
      return NextResponse.json(
        { message: 'Failed to create feature request' },
        { status: 500 }
      );
    }

    // Handle email subscription if opted in
    if (marketingOptIn) {
      // Check if email already exists
      const { data: existingSubscriber } = await supabase
        .from('email_subscribers')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (!existingSubscriber) {
        // Insert new email subscriber
        const { error: emailError } = await supabase
          .from('email_subscribers')
          .insert([
            {
              email: email.toLowerCase().trim(),
              name: name.trim(),
              signup_source: 'roadmap'
            }
          ]);

        if (emailError) {
          console.warn('Failed to add email subscriber:', emailError);
          // Don't fail the entire request if email subscription fails
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Feature request submitted successfully. It will appear in the community voting once approved.',
      featureRequest
    });

  } catch (error) {
    console.error('Failed to submit feature request:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}