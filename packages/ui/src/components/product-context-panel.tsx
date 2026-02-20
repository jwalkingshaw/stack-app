'use client';

import React, { useState, useMemo } from 'react';
import { Badge } from './badge';
import { Button } from './button';
import { 
  Package, 
  Link, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  Tag,
  Calendar,
  Target,
  Zap,
  Eye,
  BarChart3
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ProductLink {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  brand: string;
  linkContext: string;
  confidence: number;
  createdAt: string;
  createdBy: string;
}

interface AssetWithProductContext {
  id: string;
  filename: string;
  assetType?: string;
  assetScope?: string;
  productLinks: ProductLink[];
  tags?: string[];
  createdAt: string;
}

interface ProductContextPanelProps {
  asset: AssetWithProductContext;
  onViewProduct?: (productId: string) => void;
  onUnlinkProduct?: (linkId: string) => void;
  onAddProductLink?: () => void;
  className?: string;
}

interface ProductContextSummaryProps {
  assets: AssetWithProductContext[];
  onFilterByProduct?: (productId: string) => void;
  className?: string;
}

const ProductLinkCard: React.FC<{
  link: ProductLink;
  onView?: () => void;
  onUnlink?: () => void;
}> = ({ link, onView, onUnlink }) => {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Package className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <div className="font-medium text-sm">{link.productName}</div>
            <code className="text-xs bg-gray-100 px-1 rounded">{link.sku}</code>
          </div>
        </div>
        
        <Badge className={cn('text-xs', getConfidenceColor(link.confidence))}>
          {Math.round(link.confidence * 100)}%
        </Badge>
      </div>
      
      <div className="text-xs text-gray-600 mb-2">
        Context: <span className="font-medium">{link.linkContext}</span>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Added {new Date(link.createdAt).toLocaleDateString()}
        </div>
        
        <div className="flex items-center gap-1">
          {onView && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onView}
              className="h-6 px-2 text-xs"
            >
              <Eye className="h-3 w-3 mr-1" />
              View
            </Button>
          )}
          {onUnlink && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onUnlink}
              className="h-6 px-2 text-xs text-red-600 hover:text-red-700"
            >
              Unlink
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ProductContextPanel: React.FC<ProductContextPanelProps> = ({
  asset,
  onViewProduct,
  onUnlinkProduct,
  onAddProductLink,
  className
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasProducts = asset.productLinks.length > 0;

  return (
    <div className={cn("border rounded-lg bg-gray-50", className)}>
      <div 
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-blue-600" />
          <span className="font-medium text-sm">Product Context</span>
          {hasProducts && (
            <Badge variant="outline" className="text-xs">
              {asset.productLinks.length} linked
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {!hasProducts && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddProductLink?.();
              }}
              className="h-6 px-2 text-xs"
            >
              <Link className="h-3 w-3 mr-1" />
              Link Product
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3">
          {hasProducts ? (
            <div className="space-y-2">
              {asset.productLinks.map((link) => (
                <ProductLinkCard
                  key={link.id}
                  link={link}
                  onView={() => onViewProduct?.(link.productId)}
                  onUnlink={() => onUnlinkProduct?.(link.id)}
                />
              ))}
              
              <div className="pt-2 border-t border-gray-200">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={onAddProductLink}
                  className="w-full h-7 text-xs"
                >
                  <Link className="h-3 w-3 mr-1" />
                  Link Additional Product
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="text-gray-500 text-sm mb-2">
                This asset is not linked to any products
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={onAddProductLink}
                className="h-7 text-xs"
              >
                <Zap className="h-3 w-3 mr-1" />
                Smart Link Products
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ProductContextSummary: React.FC<ProductContextSummaryProps> = ({
  assets,
  onFilterByProduct,
  className
}) => {
  // Calculate product relationship statistics
  const stats = useMemo(() => {
    const productMap = new Map<string, {
      productId: string;
      productName: string;
      sku: string;
      assetCount: number;
      contexts: Set<string>;
    }>();

    assets.forEach(asset => {
      asset.productLinks.forEach(link => {
        if (!productMap.has(link.productId)) {
          productMap.set(link.productId, {
            productId: link.productId,
            productName: link.productName,
            sku: link.sku,
            assetCount: 0,
            contexts: new Set()
          });
        }
        
        const product = productMap.get(link.productId)!;
        product.assetCount++;
        product.contexts.add(link.linkContext);
      });
    });

    return Array.from(productMap.values())
      .sort((a, b) => b.assetCount - a.assetCount);
  }, [assets]);

  const totalLinkedAssets = assets.filter(asset => asset.productLinks.length > 0).length;
  const orphanedAssets = assets.length - totalLinkedAssets;

  return (
    <div className={cn("bg-white border rounded-lg p-4", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold">Product Relationships</h3>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{totalLinkedAssets} linked</span>
          <span>{orphanedAssets} unlinked</span>
        </div>
      </div>

      {stats.length > 0 ? (
        <div className="space-y-3">
          {stats.slice(0, 5).map((product) => (
            <div 
              key={product.productId} 
              className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer"
              onClick={() => onFilterByProduct?.(product.productId)}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                  <Package className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium text-sm">{product.productName}</div>
                  <div className="text-xs text-gray-500">
                    {product.sku} • {Array.from(product.contexts).join(', ')}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {product.assetCount} assets
                </Badge>
                <ExternalLink className="h-3 w-3 text-gray-400" />
              </div>
            </div>
          ))}

          {stats.length > 5 && (
            <div className="text-center pt-2 border-t">
              <Button variant="ghost" size="sm" className="text-xs">
                View all {stats.length} products
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-500">
          <Package className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <div className="text-sm">No product relationships found</div>
          <div className="text-xs">Upload assets or link existing ones to products</div>
        </div>
      )}
    </div>
  );
};