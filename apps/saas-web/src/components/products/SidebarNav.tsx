"use client";

import { cn } from "@/lib/utils";
import { 
  Package, 
  Layers, 
  FileText, 
  FlaskConical,
  Shield,
  Truck,
  Image,
  Globe,
  ShoppingCart,
  GitBranch,
  Settings
} from "lucide-react";

interface SidebarNavProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  collapsed?: boolean;
  className?: string;
}

const sections = [
  {
    id: "essentials",
    label: "Essentials",
    icon: Package,
    description: "Core product information",
    completeness: 85
  },
  {
    id: "variants", 
    label: "Variants",
    icon: Layers,
    description: "Product variations and options",
    completeness: 60
  },
  {
    id: "content-seo",
    label: "Content & SEO", 
    icon: FileText,
    description: "Marketing copy and SEO optimization",
    completeness: 45
  },
  {
    id: "ingredients-nutrition",
    label: "Ingredients & Nutrition",
    icon: FlaskConical, 
    description: "Formulation and nutritional facts",
    completeness: 90
  },
  {
    id: "compliance-claims",
    label: "Compliance & Claims",
    icon: Shield,
    description: "Regulatory compliance and health claims", 
    completeness: 70
  },
  {
    id: "packaging-logistics",
    label: "Packaging & Logistics",
    icon: Truck,
    description: "Packaging specs and supply chain",
    completeness: 30
  },
  {
    id: "digital-assets",
    label: "Digital Assets", 
    icon: Image,
    description: "Images, videos, and media files",
    completeness: 55
  },
  {
    id: "localization-markets",
    label: "Localization & Markets",
    icon: Globe,
    description: "Multi-market and localization data",
    completeness: 20
  },
  {
    id: "marketplace-channels",
    label: "Marketplace & Channels",
    icon: ShoppingCart,
    description: "Amazon, Mercado Libre, Shopee, etc.",
    completeness: 40
  },
  {
    id: "relationships", 
    label: "Relationships",
    icon: GitBranch,
    description: "Related products and dependencies",
    completeness: 65
  },
  {
    id: "qa-versioning-audit",
    label: "QA / Versioning / Audit", 
    icon: Settings,
    description: "Quality assurance and change tracking",
    completeness: 80
  }
];

export function SidebarNav({ 
  activeSection, 
  onSectionChange, 
  collapsed = false,
  className 
}: SidebarNavProps) {
  return (
    <nav className={cn(
      "flex flex-col gap-1 p-4",
      collapsed && "p-2",
      className
    )}>
      {sections.map((section) => {
        const Icon = section.icon;
        const isActive = activeSection === section.id;
        
        return (
          <button
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-lg transition-colors",
              "hover:bg-gray-100 focus:outline-none focus:bg-gray-100",
              isActive && "bg-blue-50 text-blue-700 hover:bg-blue-50",
              collapsed && "justify-center px-2"
            )}
            title={collapsed ? section.label : undefined}
          >
            <Icon className={cn(
              "w-4 h-4 flex-shrink-0",
              isActive ? "text-blue-600" : "text-gray-500"
            )} />
            
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "font-medium truncate",
                    isActive ? "text-blue-900" : "text-gray-900"
                  )}>
                    {section.label}
                  </div>
                  <div className={cn(
                    "text-xs truncate mt-0.5",
                    isActive ? "text-blue-600" : "text-gray-500"
                  )}>
                    {section.description}
                  </div>
                </div>
                
                {/* Completeness indicator - hidden */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-gray-200">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        section.completeness >= 80 ? "bg-green-500" :
                        section.completeness >= 60 ? "bg-yellow-500" :
                        "bg-red-400"
                      )}
                      style={{ width: `${section.completeness}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}