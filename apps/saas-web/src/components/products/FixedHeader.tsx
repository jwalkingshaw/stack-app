"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Copy, 
  Download, 
  History, 
  UserPlus,
  MoreHorizontal
} from "lucide-react";
import Link from "next/link";

interface FixedHeaderProps {
  tenantSlug: string;
  product: {
    productName: string;
    gtin?: string;
    sku?: string;
    variantCode?: string;
    status: string;
  };
  completeness?: number;
}

const statusColors = {
  Draft: "bg-gray-100 text-gray-800 hover:bg-gray-200",
  "In Review": "bg-yellow-100 text-yellow-800 hover:bg-yellow-200", 
  Approved: "bg-green-100 text-green-800 hover:bg-green-200",
  Deprecated: "bg-red-100 text-red-800 hover:bg-red-200",
  Active: "bg-green-100 text-green-800 hover:bg-green-200"
};

export function FixedHeader({ tenantSlug, product, completeness = 0 }: FixedHeaderProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left section - Navigation & Product Info */}
        <div className="flex items-center gap-4">
          <Link href={`/${tenantSlug}/products`}>
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-[#c1c5c7]">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
          
          <div className="h-6 w-px bg-gray-200" />
          
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">
              {product.productName}
            </h1>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              {product.gtin && (
                <span>GTIN: {product.gtin}</span>
              )}
              {product.sku && (
                <>
                  {product.gtin && <span>•</span>}
                  <span>SKU: {product.sku}</span>
                </>
              )}
              {product.variantCode && (
                <>
                  {(product.gtin || product.sku) && <span>•</span>}
                  <span>Variant: {product.variantCode}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right section - Status, Progress & Actions */}
        <div className="flex items-center gap-4">
          {/* Status Badge */}
          <Badge 
            variant="secondary" 
            className={`${statusColors[product.status as keyof typeof statusColors] || statusColors.Draft} border-0 font-medium`}
          >
            {product.status}
          </Badge>
          
          {/* Completeness Bar */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 whitespace-nowrap">
              {completeness}% Complete
            </span>
            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-[#c1c5c7]">
              <Copy className="w-4 h-4 mr-1" />
              Duplicate
            </Button>
            
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-[#c1c5c7]">
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-[#c1c5c7]">
              <History className="w-4 h-4 mr-1" />
              History
            </Button>
            
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-[#c1c5c7]">
              <UserPlus className="w-4 h-4 mr-1" />
              Assign
            </Button>
            
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-[#c1c5c7]">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}