"use client";

import { Button } from "./button";
import { cn } from "../lib/utils";
import {
  MagnifyingGlassIcon as Search,
  XIcon as X,
} from "@phosphor-icons/react";

/**
 * Standardized search bar for page-level search/filter.
 * Use on workspace, service-manager, connectors, tunnel, scheduled-tasks, etc.
 */
function PageSearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  // The field surface of Input, at the lg rung of the control ladder (32px):
  // a Button size="lg" beside it is the same height (D43).
  return (
    <div className={cn("group relative flex-1", className)}>
      <input
        type="search"
        aria-label={placeholder}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-border bg-popover placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/15 h-(--control-lg-height) w-full rounded-(--control-lg-radius) border pr-8 pl-9 text-sm transition-[border-color,box-shadow] duration-fast ease-out focus-visible:ring-3 focus-visible:outline-none"
      />
      <div className="text-muted-foreground group-focus-within:text-primary pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 transition-colors">
        <Search className="h-3.5 w-3.5" />
      </div>
      {value && (
        <Button
          onClick={() => onChange("")}
          variant="ghost"
          size="icon-xs"
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export { PageSearchBar };
