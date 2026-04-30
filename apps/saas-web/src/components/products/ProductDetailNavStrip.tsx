"use client";

import React, { useEffect, useRef } from "react";
import { Settings, Layers, ImageIcon, Zap } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FieldGroupSection = {
  id: string;
  label: string;
  fieldGroup: {
    field_group: {
      output_profile?: { profile_type: string } | null;
    };
  };
};

type FieldGroupStat = {
  sectionId: string;
  missingRequiredCount: number;
};

interface ProductDetailNavStripProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  dynamicFieldGroupSections: FieldGroupSection[];
  destinationLabel?: string | null;
  destinationMissingCount?: number;
  showDestinationContent?: boolean;
  productType: "parent" | "variant" | "standalone";
  variantCount?: number;
  assetCount?: number;
  assetSlotTotal?: number;
  showProductSettings?: boolean;
  showVariants?: boolean;
  showReadiness?: boolean;
  isSharedBrandView?: boolean;
  fieldGroupStats?: FieldGroupStat[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROFILE_TYPE_SHORT: Record<string, string> = {
  portal: "Portal",
  marketplace: "Marketplace",
  retail: "Retail",
  export: "Export",
  api: "API",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductDetailNavStrip({
  activeSection,
  onSectionChange,
  dynamicFieldGroupSections,
  destinationLabel = null,
  destinationMissingCount = 0,
  showDestinationContent = false,
  productType,
  variantCount,
  assetCount,
  assetSlotTotal,
  showProductSettings = false,
  showVariants = false,
  showReadiness = false,
  isSharedBrandView = false,
  fieldGroupStats,
}: ProductDetailNavStripProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll the active tab into view when activeSection changes
  useEffect(() => {
    if (activeButtonRef.current && scrollContainerRef.current) {
      activeButtonRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "nearest",
        block: "nearest",
      });
    }
  }, [activeSection]);

  // Build a quick lookup for missing counts keyed by sectionId
  const missingBySectionId = React.useMemo(() => {
    if (!fieldGroupStats) return {};
    return Object.fromEntries(
      fieldGroupStats.map((s) => [s.sectionId, s.missingRequiredCount])
    );
  }, [fieldGroupStats]);

  // Base classes
  const btnBase =
    "relative inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-t-lg px-4 text-sm font-medium transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-black)]/60";
  const btnActive =
    "bg-background text-foreground shadow-[inset_0_-2px_0_0_var(--color-accent-black)]";
  const btnInactive =
    "text-muted-foreground hover:bg-muted/35 hover:text-foreground";

  // Right-zone button (same underline style but with icons)
  const rightBtnActive =
    "bg-background text-foreground shadow-[inset_0_-2px_0_0_var(--color-accent-black)]";
  const rightBtnInactive =
    "text-muted-foreground hover:bg-muted/35 hover:text-foreground";

  return (
    <div className="flex h-12 shrink-0 items-stretch border-b border-border/60 bg-muted/15">
      {/* LEFT ZONE — attribute groups, horizontally scrollable */}
      <div
        ref={scrollContainerRef}
        className="scrollbar-none flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto px-2"
      >
        {/* Overview tab (All / Required / Missing) */}
        <button
          ref={activeSection === "attributes-all" ? activeButtonRef : undefined}
          onClick={() => onSectionChange("attributes-all")}
          className={`${btnBase} ${activeSection === "attributes-all" || activeSection === "attributes-required" || activeSection === "attributes-missing" ? btnActive : btnInactive}`}
        >
          Overview
        </button>

        {showDestinationContent && destinationLabel ? (
          <button
            ref={activeSection === "destination-content" ? activeButtonRef : undefined}
            onClick={() => onSectionChange("destination-content")}
            className={`${btnBase} ${activeSection === "destination-content" ? btnActive : btnInactive}`}
          >
            <span className="truncate">{destinationLabel}</span>
            <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground/70">
              Destination
            </span>
            {destinationMissingCount > 0 ? (
              <span className="shrink-0 rounded-full bg-amber-50 px-1.5 text-[10px] font-medium text-amber-600">
                {destinationMissingCount}
              </span>
            ) : null}
          </button>
        ) : null}

        {/* Dynamic field group tabs */}
        {dynamicFieldGroupSections.map((section) => {
          const isActive = activeSection === section.id;
          const outputProfile = section.fieldGroup.field_group.output_profile;
          const missingCount = missingBySectionId[section.id] ?? 0;

          return (
            <button
              key={section.id}
              ref={isActive ? activeButtonRef : undefined}
              onClick={() => onSectionChange(section.id)}
              className={`${btnBase} ${isActive ? btnActive : btnInactive}`}
            >
              <span className="truncate">{section.label}</span>
              {outputProfile && (
                <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground/70">
                  {PROFILE_TYPE_SHORT[outputProfile.profile_type] ??
                    outputProfile.profile_type}
                </span>
              )}
              {missingCount > 0 && (
                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 text-[10px] font-medium text-amber-600">
                  {missingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* RIGHT ZONE — secondary sections, always visible */}
      <div className="flex shrink-0 items-stretch gap-0.5 border-l border-border/60 px-2">
        {showProductSettings && (
          <button
            ref={activeSection === "product-settings" ? activeButtonRef : undefined}
            onClick={() => onSectionChange("product-settings")}
            className={`${btnBase} ${activeSection === "product-settings" ? rightBtnActive : rightBtnInactive}`}
          >
            <Settings className="h-3.5 w-3.5 shrink-0" />
            <span>Settings</span>
          </button>
        )}

        {showVariants && (
          <button
            ref={activeSection === "variants" ? activeButtonRef : undefined}
            onClick={() => onSectionChange("variants")}
            className={`${btnBase} ${activeSection === "variants" ? rightBtnActive : rightBtnInactive}`}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span>Variants</span>
            {(variantCount ?? 0) > 0 && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                {variantCount}
              </span>
            )}
          </button>
        )}

        <button
          ref={activeSection === "media" ? activeButtonRef : undefined}
          onClick={() => onSectionChange("media")}
          className={`${btnBase} ${activeSection === "media" ? rightBtnActive : rightBtnInactive}`}
        >
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          <span>Assets</span>
          {assetSlotTotal != null ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
              {assetCount ?? 0}/{assetSlotTotal}
            </span>
          ) : (assetCount ?? 0) > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
              {assetCount}
            </span>
          )}
        </button>

        {showReadiness && !isSharedBrandView && (
          <button
            ref={activeSection === "readiness" ? activeButtonRef : undefined}
            onClick={() => onSectionChange("readiness")}
            className={`${btnBase} ${activeSection === "readiness" ? rightBtnActive : rightBtnInactive}`}
          >
            <Zap className="h-3.5 w-3.5 shrink-0" />
            <span>Readiness</span>
          </button>
        )}
      </div>
    </div>
  );
}
