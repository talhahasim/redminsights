"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ResourceDetailItem } from "@/lib/types";
import { X, Users, Server, Package } from "lucide-react";

interface ResourceDetailProps {
  resourceName: string | null;
  onClose: () => void;
}

async function fetchResource(name: string): Promise<ResourceDetailItem> {
  const res = await fetch(`/api/servers?resource=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Failed to load resource");
  return res.json();
}

export function ResourceDetail({ resourceName, onClose }: ResourceDetailProps) {
  const visible = resourceName !== null;

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["resource", resourceName],
    queryFn: () => fetchResource(resourceName!),
    enabled: !!resourceName,
  });

  // Escape key closes the panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (visible) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [visible, onClose]);

  return (
    <div
      className={`shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
        visible ? "w-[40%] opacity-100" : "w-0 opacity-0"
      }`}
    >
      <div className="w-full h-full min-w-[360px] border-l border-border bg-surface overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted uppercase tracking-wider">
            Resource Details
          </span>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading && (
          <div className="py-20 text-center">
            <div className="inline-block w-5 h-5 border-2 border-border border-t-accent animate-spin" />
            <p className="text-muted mt-3 text-xs">Loading resource details...</p>
          </div>
        )}

        {error && (
          <div className="py-20 text-center px-4">
            <p className="text-accent font-medium text-sm">Failed to load</p>
            <p className="text-muted text-xs mt-1">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-3 px-4 py-1.5 bg-accent text-white text-xs hover:bg-accent-hover transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && data && (
          <div className="p-4 space-y-5">
            {/* Resource name */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-accent" />
                <h2 className="text-base font-bold text-foreground font-mono">
                  {data.name}
                </h2>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={<Server className="w-3.5 h-3.5" />}
                label="Servers"
                value={data.count.toLocaleString()}
              />
              <StatCard
                icon={<Users className="w-3.5 h-3.5" />}
                label="Total Players"
                value={data.players.toLocaleString()}
              />
            </div>

            {/* Server list */}
            {data.servers.length > 0 && (
              <div>
                <h3 className="text-[11px] text-muted uppercase tracking-wider mb-2">
                  Used by ({data.servers.length} servers)
                </h3>
                <div className="space-y-1">
                  {data.servers.map((server) => (
                    <ServerRow key={server.id} server={server} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-background border border-border px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted uppercase tracking-wider mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-bold font-mono text-foreground">{value}</div>
    </div>
  );
}

function ServerRow({
  server,
}: {
  server: ResourceDetailItem["servers"][number];
}) {
  const [imgError, setImgError] = useState(false);
  const playerPercent =
    server.svMaxclients > 0
      ? Math.round((server.clients / server.svMaxclients) * 100)
      : 0;

  return (
    <div className="bg-background border border-border hover:border-muted/30 transition-colors overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2">
        {/* Thumbnail */}
        {server.bannerDetail && !imgError ? (
          <div className="w-8 h-8 shrink-0 bg-surface overflow-hidden">
            <img
              src={server.bannerDetail}
              alt=""
              className="w-full h-full object-cover opacity-80"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-8 h-8 shrink-0 bg-surface flex items-center justify-center">
            <Server className="w-3.5 h-3.5 text-muted/30" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {server.projectName || server.hostname}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-[10px] text-muted">
              <Users className="w-2.5 h-2.5" />
              {server.clients}/{server.svMaxclients}
            </span>
            <span className="text-[10px] text-muted">{playerPercent}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
