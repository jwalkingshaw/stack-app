"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface VotingButtonProps {
  featureId: string;
  voteCount: number;
  tenantSlug: string;
  onVoteUpdate: (featureId: string, newVoteCount: number) => void;
}

export function VotingButton({ featureId, voteCount, tenantSlug, onVoteUpdate }: VotingButtonProps) {
  const [hasVoted, setHasVoted] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [currentVoteCount, setCurrentVoteCount] = useState(voteCount);

  useEffect(() => {
    // Check if user has already voted for this feature
    checkVoteStatus();
  }, [featureId]);

  useEffect(() => {
    setCurrentVoteCount(voteCount);
  }, [voteCount]);

  const checkVoteStatus = async () => {
    try {
      const response = await fetch(`/api/${tenantSlug}/roadmap/votes/${featureId}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voterIdentifier: getVoterIdentifier()
        })
      });

      if (response.ok) {
        const data = await response.json();
        setHasVoted(data.hasVoted);
      }
    } catch (error) {
      console.error('Failed to check vote status:', error);
    }
  };

  const getVoterIdentifier = () => {
    // Use a combination of browser fingerprinting for anonymous voting
    // In a real app, you might want to use a more sophisticated approach
    let identifier = localStorage.getItem('voter_id');
    if (!identifier) {
      identifier = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('voter_id', identifier);
    }
    return identifier;
  };

  const handleVote = async () => {
    setIsVoting(true);

    try {
      const response = await fetch(`/api/${tenantSlug}/roadmap/votes`, {
        method: hasVoted ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          featureRequestId: featureId,
          voterIdentifier: getVoterIdentifier()
        })
      });

      if (response.ok) {
        const data = await response.json();
        const newVoteCount = hasVoted ? currentVoteCount - 1 : currentVoteCount + 1;
        
        setHasVoted(!hasVoted);
        setCurrentVoteCount(newVoteCount);
        onVoteUpdate(featureId, newVoteCount);
      } else {
        const errorData = await response.json();
        console.error('Vote failed:', errorData.message);
      }
    } catch (error) {
      console.error('Failed to vote:', error);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="text-center">
      <Button
        variant={hasVoted ? "default" : "outline"}
        size="sm"
        onClick={handleVote}
        disabled={isVoting}
        className={`flex flex-col items-center h-auto p-2 min-w-[60px] ${
          hasVoted 
            ? "bg-primary text-primary-foreground hover:bg-primary/90" 
            : "hover:bg-primary hover:text-primary-foreground"
        }`}
      >
        <svg 
          className={`w-4 h-4 mb-1 ${isVoting ? 'animate-pulse' : ''}`}
          fill={hasVoted ? "currentColor" : "none"}
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M5 15l7-7 7 7" 
          />
        </svg>
        <span className="text-xs font-medium">
          {currentVoteCount}
        </span>
      </Button>
    </div>
  );
}