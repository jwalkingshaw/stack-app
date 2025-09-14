"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FeatureRequest } from "../types";
import { VotingButton } from "./VotingButton";

interface FeatureRequestListProps {
  featureRequests: FeatureRequest[];
  loading: boolean;
  tenantSlug: string;
  onVoteUpdate: (featureId: string, newVoteCount: number) => void;
}

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200", 
  rejected: "bg-red-100 text-red-800 border-red-200",
  in_development: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-purple-100 text-purple-800 border-purple-200",
};

const statusLabels = {
  pending: "Pending Review",
  approved: "Open for Voting",
  rejected: "Not Planned",
  in_development: "In Development", 
  completed: "Completed",
};

export function FeatureRequestList({ 
  featureRequests, 
  loading, 
  tenantSlug, 
  onVoteUpdate 
}: FeatureRequestListProps) {
  const [sortBy, setSortBy] = useState<'votes' | 'date'>('votes');

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i} className="animate-pulse" padding="md">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </Card>
        ))}
      </div>
    );
  }

  if (featureRequests.length === 0) {
    return (
      <div className="text-center py-8 text-[#f7f8f8]">
        <svg className="mx-auto h-12 w-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p>No feature requests yet. Be the first to submit one!</p>
      </div>
    );
  }

  const sortedRequests = [...featureRequests].sort((a, b) => {
    if (sortBy === 'votes') {
      return b.vote_count - a.vote_count;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      {/* Sort Controls */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-[#f7f8f8]">
          {featureRequests.length} feature request{featureRequests.length !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <Button
            variant={sortBy === 'votes' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSortBy('votes')}
          >
            Most Voted
          </Button>
          <Button
            variant={sortBy === 'date' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSortBy('date')}
          >
            Newest
          </Button>
        </div>
      </div>

      {/* Feature Request Cards */}
      <div className="space-y-4">
        {sortedRequests.map((request) => (
          <Card key={request.id} className="hover:shadow-medium transition-shadow border-[#f7f8f8]/20" padding="md">
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                    <h3 className="font-medium text-[#f7f8f8]">{request.title}</h3>
                    <Badge className={statusColors[request.status]}>
                      {statusLabels[request.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-[#f7f8f8] mb-3 leading-relaxed">
                    {request.description}
                  </p>
                  <div className="flex items-center justify-between text-xs text-[#f7f8f8]">
                    <span>
                      Submitted by <span className="font-medium">{request.submitter_name}</span> on {formatDate(request.created_at)}
                    </span>
                  </div>
                </div>

                {request.status === 'approved' && (
                  <div className="flex-shrink-0 self-start">
                    <VotingButton
                      featureId={request.id}
                      voteCount={request.vote_count}
                      tenantSlug={tenantSlug}
                      onVoteUpdate={onVoteUpdate}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}