'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  Package,
  Settings,
  Zap,
  Shield,
  FileText,
  ShoppingCart,
  ImageIcon,
  ArrowLeft,
  Database,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProductDetailSection {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  completeness?: number;
  isFieldGroup?: boolean;
  fieldGroup?: any;
}

interface FieldGroup {
  id: string;
  code: string;
  name: string;
  description?: string;
}

interface SafeUser {
  id: string;
  email: string;
  given_name: string | null;
  family_name: string | null;
  picture: string | null;
}

interface SafeOrganization {
  id: string;
  name: string;
  slug: string;
  storageUsed: number;
  storageLimit: number;
}

interface ProductDetailNavigationProps {
  tenantSlug: string;
  productId: string;
  organization?: SafeOrganization | null;
  user?: SafeUser | null;
}

const staticSections: ProductDetailSection[] = [
  { id: 'variants', label: 'Variants', icon: Settings, completeness: 100 },
  { id: 'media', label: 'Media Assets', icon: ImageIcon, completeness: 10 }
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function ProductDetailNavigation({
  tenantSlug,
  productId,
  organization,
  user
}: ProductDetailNavigationProps) {
  const [activeSection, setActiveSection] = useState('variants');
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([]);
  const [productSections, setProductSections] = useState<ProductDetailSection[]>(staticSections);
  const [loading, setLoading] = useState(true);

  // Simple section state management
  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
    // Store in localStorage for persistence (only on client side)
    if (typeof window !== 'undefined') {
      localStorage.setItem('productDetailActiveSection', sectionId);
      // Dispatch a simple event
      window.dispatchEvent(new Event('productSectionChanged'));
    }
  };

  // Fetch field groups for this product's family
  useEffect(() => {
    const fetchFieldGroups = async () => {
      try {
        setLoading(true);

        // First get the product to find its family
        const productResponse = await fetch(`/api/${tenantSlug}/products/${productId}`);
        if (!productResponse.ok) {
          throw new Error('Failed to fetch product');
        }

        const productData = await productResponse.json();
        const product = productData.data || productData;

        if (product.family_id) {
          // Fetch field groups for the family
          const fieldGroupsResponse = await fetch(`/api/${tenantSlug}/product-families/${product.family_id}/field-groups`);
          if (fieldGroupsResponse.ok) {
            const fieldGroupsData = await fieldGroupsResponse.json();
            const groups = fieldGroupsData.data || fieldGroupsData || [];

            // Convert field groups to sections
            const dynamicSections: ProductDetailSection[] = groups.map((group: any) => ({
              id: group.field_groups?.code || group.code || group.id,
              label: group.field_groups?.name || group.name,
              icon: Layers,
              isFieldGroup: true,
              fieldGroup: group.field_groups || group
            }));

            // Combine with static sections
            setProductSections([...dynamicSections, ...staticSections]);
            setFieldGroups(groups);

            // Set first field group as active if no saved section
            if (dynamicSections.length > 0 && typeof window !== 'undefined') {
              const savedSection = localStorage.getItem('productDetailActiveSection');
              if (!savedSection || !dynamicSections.find(s => s.id === savedSection)) {
                setActiveSection(dynamicSections[0].id);
              } else {
                setActiveSection(savedSection);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching field groups:', error);
        // Fallback to static sections
        setProductSections(staticSections);
      } finally {
        setLoading(false);
      }
    };

    fetchFieldGroups();
  }, [tenantSlug, productId]);

  // Load saved section on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSection = localStorage.getItem('productDetailActiveSection');
      if (savedSection) {
        setActiveSection(savedSection);
      }
    }
  }, []);

  const storagePercentage = organization && organization.storageLimit > 0
    ? (organization.storageUsed / organization.storageLimit) * 100
    : 0;

  return (
    <div className="bg-[#f5f5f5] h-full flex flex-col w-48">
      {/* Back to Products Button */}
      <div className="px-2 py-4">
        <Link href={`/${tenantSlug}/products`}>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 px-3 py-2 text-sm font-normal text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ArrowLeft className="h-4 w-4 flex-shrink-0" />
            Back to products
          </Button>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2">
        <div className="space-y-0.5">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Loading field groups...
            </div>
          ) : (
            productSections.map((section) => {
              const Icon = section.icon;
              const active = activeSection === section.id;

              return (
                <button
                  key={section.id}
                  onClick={() => handleSectionClick(section.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm font-normal rounded-md transition-colors text-left",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{section.label}</span>
                </button>
              );
            })
          )}
        </div>
      </nav>

      {/* Storage Stats - matches SaaSSidebar */}
      {organization && organization.storageLimit > 0 && (
        <div className="p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Storage</span>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{formatFileSize(organization.storageUsed)}</span>
              <span>{formatFileSize(organization.storageLimit)}</span>
            </div>

            <div className="w-full bg-muted rounded-sm h-1.5 overflow-hidden">
              <div
                className="bg-primary h-1.5 rounded-sm transition-all duration-300"
                style={{ width: `${Math.min(storagePercentage, 100)}%` }}
              />
            </div>

            {storagePercentage > 90 && (
              <Button variant="outline" size="sm" className="w-full mt-2 text-xs">
                Upgrade
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}