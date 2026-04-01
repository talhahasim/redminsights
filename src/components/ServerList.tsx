"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ServerItem, SortDirection, PaginatedResponse } from "@/lib/types";
import { fetchServers } from "@/lib/queries";
import { SearchBar } from "./SearchBar";
import { SortButton } from "./SortButton";
import { Users, Maximize, Type, Package, Globe, Gamepad2, Tag, Server } from "lucide-react";

type SortField = "clients" | "svMaxclients" | "hostname" | "resources";

interface ServerListProps {
  onSelectServer?: (id: string) => void;
  selectedServerId?: string | null;
}

export function ServerList({ onSelectServer, selectedServerId }: ServerListProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("clients");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const loaderRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["servers", search, sortField, sortDir],
    queryFn: ({ pageParam }) => fetchServers(pageParam, search, sortField, sortDir),
    initialPageParam: 1,
    getNextPageParam: (lastPage: PaginatedResponse<ServerItem>) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
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

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col gap-3 mb-5">
        <SearchBar
          onChange={handleSearch}
          placeholder="Search servers by name, tags, or ID..."
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {total.toLocaleString()} servers found
          </span>
          <div className="flex gap-1">
            <SortButton
              label="Players"
              active={sortField === "clients"}
              direction={sortDir}
              onClick={() => toggleSort("clients")}
              icon={<Users className="w-3 h-3" />}
            />
            <SortButton
              label="Max Slots"
              active={sortField === "svMaxclients"}
              direction={sortDir}
              onClick={() => toggleSort("svMaxclients")}
              icon={<Maximize className="w-3 h-3" />}
            />
            <SortButton
              label="Name"
              active={sortField === "hostname"}
              direction={sortDir}
              onClick={() => toggleSort("hostname")}
              icon={<Type className="w-3 h-3" />}
            />
            <SortButton
              label="Resources"
              active={sortField === "resources"}
              direction={sortDir}
              onClick={() => toggleSort("resources")}
              icon={<Package className="w-3 h-3" />}
            />
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-20 text-center">
          <div className="inline-block w-5 h-5 border-2 border-border border-t-accent animate-spin" />
          <p className="text-muted mt-3 text-xs">Loading servers...</p>
        </div>
      )}

      {/* Server cards */}
      {!isLoading && (
        <div className="space-y-2">
          {items.map((server, idx) => (
            <ServerCard
              key={`${server.id}-${idx}`}
              server={server}
              selected={selectedServerId === server.id}
              onClick={() => onSelectServer?.(server.id)}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div ref={loaderRef} className="py-10 text-center text-muted text-xs">
          {isFetchingNextPage ? "Loading..." : ""}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="py-20 text-center text-muted text-sm">
          No servers found.
        </div>
      )}
    </div>
  );
}

function ServerCard({
  server,
  selected,
  onClick,
}: {
  server: ServerItem;
  selected: boolean;
  onClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const playerPercent =
    server.svMaxclients > 0
      ? Math.round((server.clients / server.svMaxclients) * 100)
      : 0;

  return (
    <div
      onClick={onClick}
      className={`bg-surface border transition-colors overflow-hidden cursor-pointer ${
        selected
          ? "border-accent/50 bg-accent/5"
          : "border-border hover:border-muted/30"
      }`}
    >
      <div className="flex p-3 gap-3">
        {/* Banner thumbnail */}
        {server.bannerDetail && !imgError ? (
          <div className="w-16 h-16 shrink-0 bg-background overflow-hidden">
            <img
              src={server.bannerDetail}
              alt=""
              className="w-full h-full object-cover opacity-80"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-16 h-16 shrink-0 bg-background/50 flex items-center justify-center">
            <Server className="w-5 h-5 text-muted/30" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Top row: name + player count */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-foreground text-sm leading-tight truncate">
                {server.projectName || server.hostname}
              </h3>
              <p className="text-xs text-muted mt-0.5 truncate">
                {server.projectDesc || server.hostname}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="flex items-center gap-1.5 text-sm">
                <Users className="w-3.5 h-3.5 text-muted" />
                <span className="font-mono font-bold text-foreground">
                  {server.clients.toLocaleString()}
                </span>
                <span className="text-muted text-xs">
                  /{server.svMaxclients}
                </span>
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                {playerPercent}% full
              </div>
            </div>
          </div>

          {/* Meta row + tags */}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted">
            {server.locale && (
              <span className="flex items-center gap-1 uppercase">
                <Globe className="w-3 h-3" />
                {server.locale}
              </span>
            )}
            {server.resourceCount > 0 && (
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                {server.resourceCount}
              </span>
            )}
            {server.gametype && (
              <span className="flex items-center gap-1">
                <Gamepad2 className="w-3 h-3" />
                {server.gametype}
              </span>
            )}
            {server.tags &&
              server.tags
                .split(",")
                .slice(0, 4)
                .map((tag) => tag.trim())
                .filter(Boolean)
                .map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-background border border-border text-muted"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}
