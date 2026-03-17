"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  ResourceItem,
  SortDirection,
  PaginatedResponse,
  Meta,
} from "@/lib/types";
import { SearchBar } from "./SearchBar";
import { SortButton } from "./SortButton";
import { Server, Users, Hash, Download } from "lucide-react";

type SortField = "count" | "name" | "players";

interface ResourceListProps {
  onSelectResource?: (name: string) => void;
  selectedResourceName?: string | null;
  meta?: Meta | null;
}

async function fetchResources(
  page: number,
  search: string,
  sortField: SortField,
  sortDir: SortDirection
): Promise<PaginatedResponse<ResourceItem>> {
  const params = new URLSearchParams({
    tab: "resources",
    page: String(page),
    limit: "50",
    sort: sortField,
    dir: sortDir,
  });
  if (search) params.set("search", search);
  const res = await fetch(`/api/servers?${params}`);
  if (!res.ok) throw new Error("Failed to load resources");
  return res.json();
}

const isDev = process.env.NODE_ENV === "development";

export function ResourceList({ onSelectResource, selectedResourceName, meta }: ResourceListProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("count");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [exporting, setExporting] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["resources", search, sortField, sortDir],
    queryFn: ({ pageParam }) => fetchResources(pageParam, search, sortField, sortDir),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const handleSearch = useCallback((value: string) => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(value);
    }, 300);
  }, []);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: "300px",
    });
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        tab: "resources",
        page: "1",
        limit: "50",
        sort: sortField,
        dir: sortDir,
        all: "true",
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/servers?${params}`);
      if (!res.ok) return;
      const data: PaginatedResponse<ResourceItem> = await res.json();
      const csv = ["Rank,Name,Server Count"]
        .concat(data.items.map((r) => `${r.globalRank},"${r.name}",${r.count}`))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resources${search ? `-${search}` : ""}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [search, sortField, sortDir]);

  const maxCount = items.length > 0 ? items[0].count : 1;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col gap-3 mb-5">
        <SearchBar
          onChange={handleSearch}
          placeholder="Search resources..."
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">
              {total.toLocaleString()} resources
              {meta && (
                <span>
                  {" "}
                  across {meta.enrichedCount.toLocaleString()}/{meta.serverCount.toLocaleString()} servers
                </span>
              )}
            </span>
            {isDev && (
              <button
                onClick={handleExport}
                disabled={exporting || total === 0}
                className="flex items-center gap-1 px-2 py-1 text-[10px] border border-border text-muted hover:text-foreground hover:border-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3 h-3" />
                {exporting ? "Exporting..." : "CSV"}
              </button>
            )}
          </div>
          <div className="flex gap-1">
            <SortButton
              label="Servers"
              active={sortField === "count"}
              direction={sortDir}
              onClick={() => toggleSort("count")}
              icon={<Server className="w-3 h-3" />}
            />
            <SortButton
              label="Players"
              active={sortField === "players"}
              direction={sortDir}
              onClick={() => toggleSort("players")}
              icon={<Users className="w-3 h-3" />}
            />
            <SortButton
              label="Name"
              active={sortField === "name"}
              direction={sortDir}
              onClick={() => toggleSort("name")}
            />
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-20 text-center">
          <div className="inline-block w-5 h-5 border-2 border-border border-t-accent animate-spin" />
          <p className="text-muted mt-3 text-xs">Loading resources...</p>
        </div>
      )}

      {/* Resource list */}
      {!isLoading && (
        <div className="space-y-0.5">
          {items.map((resource) => {
            const barWidth =
              sortField === "count" && sortDir === "desc"
                ? (resource.count / maxCount) * 100
                : (resource.count / (meta?.enrichedCount || 1)) * 100;

            return (
              <div
                key={resource.name}
                onClick={() => onSelectResource?.(resource.name)}
                className={`bg-surface border transition-colors relative overflow-hidden group cursor-pointer ${
                  selectedResourceName === resource.name
                    ? "border-accent/50 bg-accent/5"
                    : "border-border hover:border-muted/30"
                }`}
              >
                {/* Background bar */}
                <div
                  className="absolute inset-y-0 left-0 bg-accent/8 transition-all"
                  style={{ width: `${Math.min(barWidth, 100)}%` }}
                />
                <div className="relative flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex items-center gap-0.5 text-xs text-muted/60 font-mono shrink-0 min-w-[3ch] justify-end">
                      <Hash className="w-3 h-3" />
                      {resource.globalRank}
                    </span>
                    <span className="font-mono text-sm text-foreground truncate">
                      {resource.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="flex items-center gap-1 text-xs text-muted" title="Active players">
                      <Users className="w-3 h-3" />
                      {resource.players.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted" title="Server count">
                      <Server className="w-3 h-3" />
                      {resource.count.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted/60">
                      {meta
                        ? `${Math.round((resource.count / meta.enrichedCount) * 100)}%`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasNextPage && (
        <div ref={loaderRef} className="py-10 text-center text-muted text-xs">
          {isFetchingNextPage ? "Loading..." : ""}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="py-20 text-center text-muted text-sm">
          No resources found.
        </div>
      )}
    </div>
  );
}
