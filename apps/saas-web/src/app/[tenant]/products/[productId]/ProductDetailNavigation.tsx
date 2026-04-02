'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Settings,
  ImageIcon,
  Layers
} from 'lucide-react';
import { BackLinkButton } from '@/components/ui/back-link-button';

type SectionIconProps = {
  className?: string;
};

type FieldGroupRecord = {
  id?: string;
  code?: string;
  name?: string;
  field_groups?: {
    id?: string;
    code?: string;
    name?: string;
  };
};

interface ProductDetailSection {
  id: string;
  label: string;
  icon: React.ComponentType<SectionIconProps>;
  completeness?: number;
  isFieldGroup?: boolean;
  fieldGroup?: FieldGroupRecord;
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

export default function ProductDetailNavigation({
  tenantSlug,
  productId
}: ProductDetailNavigationProps) {
  const [activeSection, setActiveSection] = useState('variants');
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
            const groups = (fieldGroupsData.data || fieldGroupsData || []) as FieldGroupRecord[];

            // Convert field groups to sections
            const dynamicSections: ProductDetailSection[] = groups.map((group, index) => ({
              id: group.field_groups?.code ?? group.code ?? group.id ?? `field-group-${index + 1}`,
              label: group.field_groups?.name ?? group.name ?? 'Attribute Group',
              icon: Layers,
              isFieldGroup: true,
              fieldGroup: group.field_groups || group
            }));

            // Combine with static sections
            setProductSections([...dynamicSections, ...staticSections]);

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

  return (
    <div className="bg-[#f5f5f5] h-full flex flex-col w-48">
      <div className="border-b border-gray-200 px-2 py-3">
        <BackLinkButton href={`/${tenantSlug}/products`} label="Back to products" fullWidth />
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

    </div>
  );
}
