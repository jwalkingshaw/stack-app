"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { FeatureSubmissionForm } from "./components/FeatureSubmissionForm";
import { FeatureRequestList } from "./components/FeatureRequestList";
import { FeatureRequest } from "./types";

interface RoadMapClientProps {
  tenantSlug: string;
}

export default function RoadMapClient({ tenantSlug }: RoadMapClientProps) {
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeatureRequests();
  }, []);

  const fetchFeatureRequests = async () => {
    try {
      const response = await fetch(`/api/${tenantSlug}/roadmap/feature-requests`);
      if (response.ok) {
        const data = await response.json();
        setFeatureRequests(data);
      }
    } catch (error) {
      console.error('Failed to fetch feature requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFeatureSubmitted = () => {
    // Refresh the feature requests list after submission
    fetchFeatureRequests();
  };

  const handleVoteUpdate = (featureId: string, newVoteCount: number) => {
    setFeatureRequests(prev => 
      prev.map(feature => 
        feature.id === featureId 
          ? { ...feature, vote_count: newVoteCount }
          : feature
      )
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="RoadMap"
        className="mb-6"
      />
      
      <div className="px-4 sm:px-6 pb-6">
        {/* Hero Section */}
        <Card className="mb-8" padding="lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold text-foreground mb-2">
              Have Your Say
            </CardTitle>
            <CardDescription className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Together we're building the OS for Sports Supplements. Share your ideas and vote on features 
              that will help solve the biggest challenges facing sports supplement brands and retailers.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          {/* Feature Submission Form */}
          <div>
            <Card padding="lg">
              <CardHeader>
                <CardTitle>Submit a Feature Request</CardTitle>
                <CardDescription>
                  Tell us what feature would make the biggest impact for your business.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FeatureSubmissionForm 
                  tenantSlug={tenantSlug}
                  onFeatureSubmitted={handleFeatureSubmitted}
                />
              </CardContent>
            </Card>
          </div>

          {/* Feature Requests List */}
          <div>
            <Card padding="lg">
              <CardHeader>
                <CardTitle>Community Feature Requests</CardTitle>
                <CardDescription>
                  Vote for the features that matter most to you. The most voted requests 
                  will be prioritized for development.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FeatureRequestList 
                  featureRequests={featureRequests}
                  loading={loading}
                  tenantSlug={tenantSlug}
                  onVoteUpdate={handleVoteUpdate}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}