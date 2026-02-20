"use client";

import { useState, useEffect } from "react";
import { X, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Show help with ? key
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Only show if not focused on an input
        if (document.activeElement?.tagName !== 'INPUT' && 
            document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsOpen(true);
        }
      }
      
      // Close help with Escape
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const shortcuts = [
    {
      category: "Selection",
      items: [
        { keys: ["Cmd", "A"], description: "Select all assets" },
        { keys: ["Shift", "Click"], description: "Select range of assets" },
        { keys: ["Esc"], description: "Clear selection" },
      ]
    },
    {
      category: "Actions",
      items: [
        { keys: ["Delete"], description: "Delete selected assets" },
        { keys: ["?"], description: "Show keyboard shortcuts" },
      ]
    }
  ];

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-30 bg-white shadow-lg hover:shadow-xl border border-border"
        title="Keyboard shortcuts (?)"
      >
        <Keyboard className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity z-40"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-lg shadow-xl border border-border w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="text-gray-600 hover:text-gray-800"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {shortcuts.map((category) => (
            <div key={category.category}>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                {category.category}
              </h4>
              <div className="space-y-2">
                {category.items.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <div key={keyIndex} className="flex items-center gap-1">
                          <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 border border-border rounded shadow-sm">
                            {key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-xs text-gray-400">+</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 pt-0">
          <div className="text-xs text-gray-500 text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 border border-border rounded">?</kbd> to toggle this help, or <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 border border-border rounded">Esc</kbd> to close
          </div>
        </div>
      </div>
    </>
  );
}