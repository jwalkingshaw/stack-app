-- RoadMap Feature System Migration
-- Creates tables for email subscribers, feature requests, and voting

-- Email subscribers table for marketing opt-ins (using existing table with signup_source column)
-- Just add indexes for the existing table structure
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_signup_source ON email_subscribers(signup_source);

-- Feature requests table
CREATE TABLE IF NOT EXISTS feature_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, in_development, completed
  approved_by TEXT, -- Admin user ID who approved it
  approved_at TIMESTAMPTZ,
  vote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for feature requests
CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_submitter_email ON feature_requests(submitter_email);
CREATE INDEX IF NOT EXISTS idx_feature_requests_vote_count ON feature_requests(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_feature_requests_created_at ON feature_requests(created_at DESC);

-- Feature votes table (tracks individual votes)
CREATE TABLE IF NOT EXISTS feature_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature_request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
  voter_identifier TEXT NOT NULL, -- Could be email or IP address for anonymous voting
  voter_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate votes from same identifier
  UNIQUE(feature_request_id, voter_identifier)
);

-- Index for vote queries
CREATE INDEX IF NOT EXISTS idx_feature_votes_feature_request_id ON feature_votes(feature_request_id);
CREATE INDEX IF NOT EXISTS idx_feature_votes_voter_identifier ON feature_votes(voter_identifier);

-- Function to update vote count when votes are added/removed
CREATE OR REPLACE FUNCTION update_feature_request_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE feature_requests 
    SET vote_count = vote_count + 1, updated_at = NOW()
    WHERE id = NEW.feature_request_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE feature_requests 
    SET vote_count = vote_count - 1, updated_at = NOW()
    WHERE id = OLD.feature_request_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update vote count
CREATE TRIGGER trigger_update_vote_count
  AFTER INSERT OR DELETE ON feature_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_request_vote_count();

-- Row Level Security (RLS) policies
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_votes ENABLE ROW LEVEL SECURITY;

-- Public read access for approved feature requests
CREATE POLICY "Public read access for approved feature requests" ON feature_requests
  FOR SELECT USING (status = 'approved');

-- Public insert access for new feature requests
CREATE POLICY "Public insert access for feature requests" ON feature_requests
  FOR INSERT WITH CHECK (true);

-- Public read access for votes on approved features
CREATE POLICY "Public read access for votes on approved features" ON feature_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM feature_requests 
      WHERE id = feature_votes.feature_request_id 
      AND status = 'approved'
    )
  );

-- Public insert access for votes on approved features
CREATE POLICY "Public insert access for votes on approved features" ON feature_votes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM feature_requests 
      WHERE id = feature_request_id 
      AND status = 'approved'
    )
  );

-- Public delete access for removing own votes
CREATE POLICY "Public delete access for own votes" ON feature_votes
  FOR DELETE USING (true); -- Will be restricted by application logic

-- Email subscribers policies (public insert for opt-ins, admin access for management)
CREATE POLICY "Public insert access for email subscribers" ON email_subscribers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read access for own email subscription" ON email_subscribers
  FOR SELECT USING (true); -- Limited by application logic