"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ServerDetailItem } from "@/lib/types";
import { fetchServerDetail } from "@/lib/queries";
import {
  X,
  Users,
  Globe,
  Gamepad2,
  Map,
  Tag,
  Package,
  Server,
  ExternalLink,
} from "lucide-react";

interface ServerDetailProps {
  serverId: string | null;
  onClose: () => void;
}

function ServerImage({ src }: { src: string }) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div className="w-full aspect-[16/9] bg-background flex items-center justify-center">
        <Server className="w-8 h-8 text-muted" />
      </div>
    );
  }

  return (
    <div className="w-full aspect-[16/9] bg-background overflow-hidden">
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    </div>
  );
}

export function ServerDetail({ serverId, onClose }: ServerDetailProps) {
  const visible = serverId !== null;

  const {
    data: server,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => fetchServerDetail(serverId!),
    enabled: !!serverId,
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (visible) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [visible, onClose]);

  const playerPercent =
    server && server.svMaxclients > 0
      ? Math.round((server.clients / server.svMaxclients) * 100)
      : 0;

  return (
    <div
      className={`shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
        visible ? "w-[40%] opacity-100" : "w-0 opacity-0"
      }`}
    >
      <div className="w-full h-full min-w-[360px] border-l border-border bg-surface overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted uppercase tracking-wider">
            Server Details
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
            <p className="text-muted mt-3 text-xs">Loading server details...</p>
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

        {!isLoading && !error && server && (
          <div className="p-4 space-y-5">
            {server.bannerDetail ? (
              <ServerImage key={serverId} src={server.bannerDetail} />
            ) : (
              <div className="w-full aspect-[16/9] bg-background/50 flex items-center justify-center">
                <Server className="w-10 h-10 text-muted/20" />
              </div>
            )}

            <div>
              <h2 className="text-base font-bold text-foreground leading-tight">
                {server.projectName || server.hostname}
              </h2>
              {server.projectDesc && (
                <p className="text-sm text-muted mt-1.5 leading-relaxed">
                  {server.projectDesc}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-sm">
                  <Users className="w-3.5 h-3.5 text-muted" />
                  <span className="font-mono font-bold text-foreground">
                    {server.clients.toLocaleString()}
                  </span>
                  <span className="text-muted text-xs">
                    / {server.svMaxclients}
                  </span>
                </div>
                <span className="text-xs text-muted">{playerPercent}% full</span>
              </div>
              <div className="w-full h-1.5 bg-background overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{ width: `${playerPercent}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {server.locale && (
                <MetaItem
                  icon={<Globe className="w-3.5 h-3.5" />}
                  label="Locale"
                  value={server.locale.toUpperCase()}
                />
              )}
              {server.gametype && (
                <MetaItem
                  icon={<Gamepad2 className="w-3.5 h-3.5" />}
                  label="Gametype"
                  value={server.gametype}
                />
              )}
              {server.mapname && (
                <MetaItem
                  icon={<Map className="w-3.5 h-3.5" />}
                  label="Map"
                  value={server.mapname}
                />
              )}
              <MetaItem
                icon={<Package className="w-3.5 h-3.5" />}
                label="Resources"
                value={String(server.resourceCount)}
              />
            </div>

            {server.tags && (
              <div>
                <h3 className="text-[11px] text-muted uppercase tracking-wider mb-2">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {server.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-background border border-border text-muted"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {server.id && (
              <a
                href={`https://cfx.re/join/${server.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Connect
              </a>
            )}

            {server.resources.length > 0 && (
              <div>
                <h3 className="text-[11px] text-muted uppercase tracking-wider mb-2">
                  Resources ({server.resources.length})
                </h3>
                <div className="max-h-[300px] overflow-y-auto border border-border bg-background">
                  {server.resources.sort().map((resource) => (
                    <div
                      key={resource}
                      className="px-3 py-1.5 text-xs text-foreground border-b border-border last:border-b-0 font-mono"
                    >
                      {resource}
                    </div>
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

function MetaItem({
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
      <div className="text-sm font-medium text-foreground truncate">
        {value}
      </div>
    </div>
  );
}
