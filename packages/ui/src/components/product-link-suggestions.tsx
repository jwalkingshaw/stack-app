'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  generateProductLinkSuggestions, 
  ProductLinkSuggestion,
  validateProductLink 
} from '../lib/product-linking';
import { Button } from './button';
import { Badge } from './badge';
import { 
  Link, 
  Package, 
  Check, 
  X, 
  AlertTriangle,
  ChevronDown,
  Zap,
  Eye
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Product {
  id: string;
  sku: string;
  productName: string;
  brand: string;
}

interface ProductLinkSuggestionsProps {
  filename: string;
  availableProducts: Product[];
  onLinkProduct?: (productId: string, linkContext: string, confidence: number) => void;
  onSkipSuggestions?: () => void;
  className?: string;
}

interface SuggestionCardProps {
  suggestion: ProductLinkSuggestion;
  onAccept: () => void;
  onReject: () => void;
  isProcessing?: boolean;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ 
  suggestion, 
  onAccept, 
  onReject, 
  isProcessing = false 
}) => {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <div className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Package className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="font-medium text-gray-900">{suggestion.productName}</div>
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
              {suggestion.sku}
            </code>
          </div>
        </div>
        
        <Badge 
          className={cn(
            'text-xs border',
            getConfidenceColor(suggestion.confidence)
          )}
        >
          {getConfidenceLabel(suggestion.confidence)} ({Math.round(suggestion.confidence * 100)}%)
        </Badge>
      </div>
      
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-1">Match Reason</div>
        <div className="text-sm text-gray-700">{suggestion.matchReason}</div>
      </div>
      
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Suggested Context</div>
        <Badge variant="outline" className="text-xs">
          {suggestion.linkContext}
        </Badge>
      </div>
      
      <div className="flex items-center gap-2">
        <Button 
          size="sm" 
          onClick={onAccept}
          disabled={isProcessing}
          className="flex-1"
        >
          <Check className="h-3 w-3 mr-1" />
          Link Product
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onReject}
          disabled={isProcessing}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export const ProductLinkSuggestions: React.FC<ProductLinkSuggestionsProps> = ({
  filename,
  availableProducts,
  onLinkProduct,
  onSkipSuggestions,
  className
}) => {
  const [suggestions, setSuggestions] = useState<ProductLinkSuggestion[]>([]);
  const [rejectedSuggestions, setRejectedSuggestions] = useState<Set<string>>(new Set());
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Generate suggestions when filename or products change
  useEffect(() => {
    if (filename && availableProducts.length > 0) {
      const newSuggestions = generateProductLinkSuggestions(filename, availableProducts);
      setSuggestions(newSuggestions);
      setRejectedSuggestions(new Set());
      setAcceptedSuggestions(new Set());
      
      // Auto-expand if there are good suggestions
      setIsExpanded(newSuggestions.some(s => s.confidence > 0.7));
    }
  }, [filename, availableProducts]);

  // Filter out rejected and accepted suggestions
  const activeSuggestions = useMemo(() => {
    return suggestions.filter(s => 
      !rejectedSuggestions.has(s.productId) && 
      !acceptedSuggestions.has(s.productId)
    );
  }, [suggestions, rejectedSuggestions, acceptedSuggestions]);

  const handleAcceptSuggestion = async (suggestion: ProductLinkSuggestion) => {
    setProcessingId(suggestion.productId);
    
    try {
      // Validate the link before accepting
      const validation = validateProductLink(
        filename,
        suggestion.sku,
        suggestion.productName,
        suggestion.linkContext
      );
      
      if (onLinkProduct) {
        await onLinkProduct(
          suggestion.productId, 
          suggestion.linkContext, 
          validation.confidence
        );
      }
      
      setAcceptedSuggestions(prev => new Set([...prev, suggestion.productId]));
    } catch (error) {
      console.error('Failed to link product:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectSuggestion = (suggestion: ProductLinkSuggestion) => {
    setRejectedSuggestions(prev => new Set([...prev, suggestion.productId]));
  };

  const handleSkipAll = () => {
    if (onSkipSuggestions) {
      onSkipSuggestions();
    }
    setRejectedSuggestions(new Set(suggestions.map(s => s.productId)));
  };

  // Don't render if no suggestions
  if (suggestions.length === 0) {
    return null;
  }

  // Don't render if all suggestions have been handled
  if (activeSuggestions.length === 0 && acceptedSuggestions.size > 0) {
    return (
      <div className={cn("border border-green-200 bg-green-50 rounded-lg p-3", className)}>
        <div className="flex items-center gap-2 text-green-800">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">
            Product linked successfully! ({acceptedSuggestions.size} connection{acceptedSuggestions.size > 1 ? 's' : ''} made)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("border border-blue-200 bg-blue-50 rounded-lg", className)}>
      <div 
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-900">
            Smart Product Linking
          </span>
          <Badge variant="outline" className="text-xs">
            {activeSuggestions.length} suggestion{activeSuggestions.length > 1 ? 's' : ''}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          {!isExpanded && activeSuggestions.length > 0 && (
            <Badge className="bg-blue-100 text-blue-800 text-xs">
              {activeSuggestions[0].confidence >= 0.8 ? 'High confidence match' : 'Suggestions available'}
            </Badge>
          )}
          <ChevronDown 
            className={cn(
              "h-4 w-4 text-blue-600 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="text-xs text-blue-700 mb-3">
            Based on the filename <code className="bg-blue-100 px-1 rounded">{filename}</code>, 
            we found potential product matches:
          </div>

          {activeSuggestions.length > 0 ? (
            <>
              <div className="space-y-3 mb-3">
                {activeSuggestions.slice(0, 3).map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.productId}
                    suggestion={suggestion}
                    onAccept={() => handleAcceptSuggestion(suggestion)}
                    onReject={() => handleRejectSuggestion(suggestion)}
                    isProcessing={processingId === suggestion.productId}
                  />
                ))}
              </div>

              {activeSuggestions.length > 3 && (
                <div className="text-center">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {/* Could expand to show all suggestions */}}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View {activeSuggestions.length - 3} more suggestions
                  </Button>
                </div>
              )}

              <div className="flex justify-center mt-3 pt-3 border-t border-blue-200">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSkipAll}
                  className="text-xs"
                >
                  Skip product linking for this asset
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-blue-700 text-sm">
              No additional product matches found for this asset.
            </div>
          )}
        </div>
      )}
    </div>
  );
};