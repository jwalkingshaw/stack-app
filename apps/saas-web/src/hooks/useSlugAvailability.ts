"use client";

import { useState, useEffect, useCallback } from 'react';

interface AvailabilityResult {
  available: boolean;
  reason?: string;
  message?: string;
  slug?: string;
}

interface SuggestionResult {
  original: string;
  suggestions: string[];
  message: string;
}

interface UseSlugAvailabilityReturn {
  // Availability check
  availability: AvailabilityResult | null;
  isCheckingAvailability: boolean;
  
  // Suggestions
  suggestions: string[];
  isLoadingSuggestions: boolean;
  
  // Actions
  checkAvailability: (slug: string) => void;
  getSuggestions: (slug: string, companyName?: string) => void;
  clearSuggestions: () => void;
  
  // Computed states
  isValidFormat: boolean;
  isAvailable: boolean;
}

export function useSlugAvailability(): UseSlugAvailabilityReturn {
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [currentSlug, setCurrentSlug] = useState('');

  // Debounced availability check
  const checkAvailability = useCallback(
    debounce(async (slug: string) => {
      if (!slug || slug.length < 3) {
        setAvailability(null);
        return;
      }

      setCurrentSlug(slug);
      setIsCheckingAvailability(true);
      // Clear previous availability state to show immediate loading feedback
      setAvailability(null);
      
      try {
        // Use the fast exists endpoint for real-time checking
        const response = await fetch(`/api/organizations/exists?slug=${encodeURIComponent(slug)}`);
        const result = await response.json();
        
        // Always update since we debounced properly 
        setAvailability({
          available: !result.exists,
          reason: result.exists ? 'taken' : undefined,
          message: result.exists ? 'This organization name is already taken' : 'This organization name is available!',
          slug: slug
        });
      } catch (error) {
        console.error('Availability check failed:', error);
        setAvailability({
          available: false,
          reason: 'network_error',
          message: 'Unable to check availability. Please try again.'
        });
      } finally {
        setIsCheckingAvailability(false);
      }
    }, 250), // 250ms debounce - industry standard for real-time checks
    [currentSlug]
  );

  // Get suggestions for unavailable slug
  const getSuggestions = useCallback(async (slug: string, companyName?: string) => {
    if (!slug) return;
    
    setIsLoadingSuggestions(true);
    setSuggestions([]);
    
    try {
      const params = new URLSearchParams({ slug });
      if (companyName) {
        params.append('name', companyName);
      }
      
      const response = await fetch(`/api/organizations/suggest-alternatives?${params.toString()}`);
      const result: SuggestionResult = await response.json();
      
      setSuggestions(result.suggestions || []);
    } catch (error) {
      console.error('Suggestion generation failed:', error);
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  // Computed states
  const isValidFormat = availability ? availability.reason !== 'invalid_format' : true;
  const isAvailable = availability ? availability.available : false;

  return {
    availability,
    isCheckingAvailability,
    suggestions,
    isLoadingSuggestions,
    checkAvailability,
    getSuggestions,
    clearSuggestions,
    isValidFormat,
    isAvailable
  };
}

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}