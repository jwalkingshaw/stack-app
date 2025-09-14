export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  submitter_name: string;
  submitter_email: string;
  status: 'pending' | 'approved' | 'rejected' | 'in_development' | 'completed';
  approved_by?: string;
  approved_at?: string;
  vote_count: number;
  created_at: string;
  updated_at: string;
}

export interface FeatureVote {
  id: string;
  feature_request_id: string;
  voter_identifier: string;
  voter_name?: string;
  created_at: string;
}

export interface EmailSubscriber {
  id: string;
  email: string;
  name?: string;
  source: string;
  subscribed_at: string;
  unsubscribed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FeatureSubmissionData {
  name: string;
  email: string;
  title: string;
  description: string;
  marketingOptIn: boolean;
}