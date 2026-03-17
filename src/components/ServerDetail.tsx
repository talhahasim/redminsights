"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ServerItem } from "@/lib/types";
import { X, Users, Globe, Gamepad2, Map, Tag, Server } from "lucide-react";

interface ServerDetailProps {
  serverId: string | null;
  onClose: () => void;
}

async function fetchServer(id: string): Promise<ServerItem> {
  const res = await fetch(`/api/servers?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Failed to load server");
  return res.json();
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
    </div>
  );
}

export function ServerDetail({ serverId, onClose }: ServerDetailProps) {
  const prevServerIdRef = useRef(serverId);
  const visible = serverId !== null;

  const { data: server, isLoading, error, refetch } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => fetchServer(serverId!),
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

  const playerPercent = server && server.svMaxclients > 0
    ? Math.round((server.clients / server.svMaxclients) * 100)
    : 0;

  return (
    <div className={`shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${visible ? "w-[40%] opacity-100" : "w-0 opacity-0"}`}>
      <div className="w-full h-full min-w-[360px] border-l border-border bg-surface overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted uppercase tracking-wider">Server Details</span>
          <button onClick={onClose} className="p-1 text-muted hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading && (
          <div className="py-20 text-center">
            <div className="inline-block w-5 h-5 border-2 border-border border-t-accent animate-spin" />
            <p className="text-muted mt-3 text-xs">Loading...</p>
          </div>
        )}

        {error && (
          <div className="py-20 text-center px-4">
            <p className="text-accent font-medium text-sm">Failed to load</p>
            <button onClick={() => refetch()} className="mt-3 px-4 py-1.5 bg-accent text-white text-xs">Retry</button>
          </div>
        )}

        {!isLoading && !error && server && (
          <div className="p-4 space-y-5">
            {server.bannerDetail ? <ServerImage key={serverId} src={server.bannerDetail} /> : (
              <div className="w-full aspect-[16/9] bg-background/50 flex items-center justify-center">
                <Server className="w-10 h-10 text-muted/20" />
              </div>
            )}

            <div>
              <h2 className="text-base font-bold text-foreground leading-tight">{server.projectName || server.hostname}</h2>
              {server.projectDesc && <p className="text-sm text-muted mt-1.5 leading-relaxed">{server.projectDesc}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted"><Users className="w-3.5 h-3.5" />Players</div>
                <div className="text-sm font-mono font-bold text-foreground">{server.clients}/{server.svMaxclients}</div>
              </div>
              <div className="h-1.5 bg-background overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${playerPercent}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {server.locale && <InfoItem icon={<Globe className="w-3.5 h-3.5" />} label="Region" value={server.locale.toUpperCase()} />}
              {server.gametype && <InfoItem icon={<Gamepad2 className="w-3.5 h-3.5" />} label="Gamemode" value={server.gametype} />}
              {server.mapname && <InfoItem icon={<Map className="w-3.5 h-3.5" />} label="Map" value={server.mapname} />}
            </div>

            {server.tags && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted mb-2"><Tag className="w-3.5 h-3.5" />Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {server.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                    <span key={tag} className="px-2 py-1 text-[11px] bg-background border border-border text-muted">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-border text-[11px] text-muted font-mono break-all">ID: {server.id}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-2 bg-background/50 border border-border">
      <div className="flex items-center gap-1.5 text-muted mb-1">{icon}{label}</div>
      <div className="font-medium text-foreground truncate">{value}</div>
    </div>
  );
}
