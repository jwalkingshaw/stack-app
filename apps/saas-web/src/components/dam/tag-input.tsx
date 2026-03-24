"use client";

import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const splitTokens = (value: string) =>
  value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

export function TagInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");

  const addTokens = useCallback(
    (raw: string) => {
      const tokens = splitTokens(raw);
      if (tokens.length === 0) return;
      const next = Array.from(new Set([...(value || []), ...tokens]));
      onChange(next);
      setInputValue("");
    },
    [value, onChange]
  );

  const removeToken = (token: string) => {
    onChange(value.filter((item) => item !== token));
  };

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs">
      {value.map((token) => (
        <Badge key={token} variant="secondary" className="flex items-center gap-1 px-2 py-0.5 text-xs">
          {token}
          {!disabled && (
            <button
              type="button"
              onClick={() => removeToken(token)}
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
      {!disabled && (
        <input
          aria-label={ariaLabel}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => addTokens(inputValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTokens(inputValue);
            }
            if (e.key === "Backspace" && inputValue.length === 0 && value.length > 0) {
              removeToken(value[value.length - 1]);
            }
          }}
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
