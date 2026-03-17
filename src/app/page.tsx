"use client";

export const runtime = 'edge';

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Meta } from "@/lib/types";
import { ServerList } from "@/components/ServerList";
import { ServerDetail } from "@/components/ServerDetail";
import { ResourceList } from "@/components/ResourceList";
import { ResourceDetail } from "@/components/ResourceDetail";
import { Server, Package, Users, RefreshCw } from "lucide-react";

type Tab = "servers" | "resources";

async function fetchMeta(): Promise<Meta> {
  const res = await fetch("/api/servers?meta=true");
  if (!res.ok) throw new Error("Failed to load data");
  return res.json();
}

export default function Home() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("servers");
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedResourceName, setSelectedResourceName] = useState<string | null>(null);

  const {
    data: meta,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["meta"],
    queryFn: fetchMeta,
  });

  const hasSelection =
    (tab === "servers" && selectedServerId !== null) ||
    (tab === "resources" && selectedResourceName !== null);

  // Handle tab change - clear selections
  const handleTabChange = useCallback((newTab: Tab) => {
    setTab(newTab);
    setSelectedServerId(null);
    setSelectedResourceName(null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedServerId(null);
    setSelectedResourceName(null);
  }, []);

  const handleSelectServer = useCallback((id: string) => {
    setSelectedServerId((prev) => (prev === id ? null : id));
  }, []);

  const handleSelectResource = useCallback((name: string) => {
    setSelectedResourceName((prev) => (prev === name ? null : name));
  }, []);

  const expandStyle = { width: "92%", marginLeft: "4%", marginRight: "4%" };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div
          className="w-[60%] min-w-[600px] mx-auto py-5 transition-all duration-300 ease-in-out"
          style={hasSelection ? expandStyle : undefined}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                RedM<span className="text-accent">Insights</span>
              </h1>
              <span className="text-xs text-muted uppercase tracking-widest">
                Server & Resource Analytics
              </span>
            </div>
            {meta && (
              <div className="flex items-center gap-8">
                <Stat label="Servers" value={meta.serverCount} icon={<Server className="w-3.5 h-3.5" />} />
                <Stat label="Resources" value={meta.resourceCount} icon={<Package className="w-3.5 h-3.5" />} />
                <Stat label="Players Online" value={meta.totalPlayers} icon={<Users className="w-3.5 h-3.5" />} />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-surface/50">
        <div
          className="w-[60%] min-w-[600px] mx-auto flex transition-all duration-300 ease-in-out"
          style={hasSelection ? expandStyle : undefined}
        >
          <TabButton
            active={tab === "servers"}
            onClick={() => handleTabChange("servers")}
            icon={<Server className="w-3.5 h-3.5" />}
          >
            Servers
          </TabButton>
          <TabButton
            active={tab === "resources"}
            onClick={() => handleTabChange("resources")}
            icon={<Package className="w-3.5 h-3.5" />}
          >
            Resources
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1">
        <div
          className="mx-auto py-6 transition-all duration-300 ease-in-out flex gap-6"
          style={
            hasSelection
              ? expandStyle
              : { width: "60%", minWidth: "600px" }
          }
        >
          {/* Main content area */}
          <div className={`transition-all duration-300 ease-in-out ${hasSelection ? "flex-1 min-w-0" : "w-full"}`}>
            {isLoading && (
              <div className="py-32 text-center">
                <div className="inline-block w-5 h-5 border-2 border-border border-t-accent animate-spin" />
                <p className="text-muted mt-4 text-sm">
                  Loading data...
                </p>
              </div>
            )}

            {error !== null && (
              <div className="py-32 text-center">
                <p className="text-accent font-medium">Failed to load data</p>
                <p className="text-muted text-sm mt-2">
                  {(error as Error)?.message ?? "Unknown error"}
                </p>
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["meta"] })}
                  className="mt-4 px-5 py-2 bg-accent text-white text-sm hover:bg-accent-hover transition-colors flex items-center gap-2 mx-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !error && (
              <>
                {tab === "servers" && (
                  <ServerList
                    onSelectServer={handleSelectServer}
                    selectedServerId={selectedServerId}
                  />
                )}
                {tab === "resources" && (
                  <ResourceList
                    onSelectResource={handleSelectResource}
                    selectedResourceName={selectedResourceName}
                    meta={meta}
                  />
                )}
                {meta && (
                  <div className="mt-8 pt-4 border-t border-border text-xs text-muted text-center">
                    Cached {new Date(meta.cachedAt).toLocaleString()} — Refreshes
                    every 24h — Resource data from {meta.enrichedCount}/
                    {meta.serverCount} servers
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detail sidebar */}
          {tab === "servers" && (
            <ServerDetail
              serverId={selectedServerId}
              onClose={handleCloseDetail}
            />
          )}
          {tab === "resources" && (
            <ResourceDetail
              resourceName={selectedResourceName}
              onClose={handleCloseDetail}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1 text-[11px] text-muted uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="font-mono font-bold text-foreground text-sm">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-accent text-accent"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
