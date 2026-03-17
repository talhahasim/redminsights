"use client";

import type { SortDirection } from "@/lib/types";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { ReactNode } from "react";

interface SortButtonProps {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  icon?: ReactNode;
}

export function SortButton({
  label,
  active,
  direction,
  onClick,
  icon,
}: SortButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border transition-colors ${
        active
          ? "bg-accent text-white border-accent"
          : "bg-surface border-border text-muted hover:text-foreground hover:border-muted"
      }`}
    >
      {icon}
      {label}
      {active && (
        direction === "desc"
          ? <ArrowDown className="w-3 h-3" />
          : <ArrowUp className="w-3 h-3" />
      )}
    </button>
  );
}
