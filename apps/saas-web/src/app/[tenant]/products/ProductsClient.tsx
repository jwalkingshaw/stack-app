"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PIMTable } from "@/components/products/pim-table";
import { AddProductModal } from "@/components/products/add-product-modal";
import { PageHeader } from "@/components/ui/page-header";

interface ProductsClientProps {
  tenantSlug: string;
}


export function ProductsClient({ tenantSlug }: ProductsClientProps) {
  const router = useRouter();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleProductClick = (product: any) => {
    console.log('🔵 Product clicked:', product);
    router.push(`/${tenantSlug}/products/${product.id}`);
  };

  const handleAddProduct = () => {
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        actions={[
          {
            label: "Add Product",
            onClick: handleAddProduct,
            icon: Plus
          }
        ]}
      />
      
      <div className="p-6">
        <PIMTable 
          tenantSlug={tenantSlug}
          onProductClick={handleProductClick}
          onCreateProduct={handleAddProduct}
        />
        
        <AddProductModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          tenantSlug={tenantSlug}
        />
      </div>
    </div>
  );
}