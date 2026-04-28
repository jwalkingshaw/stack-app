"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SectionContainerProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  tabs?: {
    id: string;
    label: string;
    active: boolean;
    onClick: () => void;
  }[];
}

export function SectionContainer({ 
  title, 
  description, 
  children, 
  className,
  tabs 
}: SectionContainerProps) {
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Section Header */}
      <div className="flex-shrink-0 px-8 py-6 border-b bg-white">
        <div className="max-w-5xl">
          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          {description && (
            <p className="mt-2 text-sm text-gray-600 max-w-2xl">{description}</p>
          )}
          
          {/* Optional tabs */}
          {tabs && tabs.length > 0 && (
            <div className="flex gap-1 mt-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={tab.onClick}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                    tab.active 
                      ? "bg-gray-100 text-gray-900" 
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Section Content */}
      <div className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          <div className="max-w-5xl">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}