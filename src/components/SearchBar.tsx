"use client";

import { Search } from "lucide-react";

interface SearchBarProps {
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ onChange, placeholder }: SearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
      <input
        type="text"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Search..."}
        className="w-full bg-surface border border-border pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
      />
    </div>
  );
}
