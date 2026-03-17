"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Meta } from "@/lib/types";
import { ServerList } from "@/components/ServerList";
import { ServerDetail } from "@/components/ServerDetail";
import { Server, Users, RefreshCw } from "lucide-react";

async function fetchMeta(): Promise<Meta> {
  const res = await fetch("/api/servers?meta=true");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load data");
  }
  return res.json();
}

export default function Home() {
  const queryClient = useQueryClient();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  const {
    data: meta,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["meta"],
    queryFn: fetchMeta,
    retry: 2,
    retryDelay: 1000,
  });

  const hasSelection = selectedServerId !== null;

  const handleCloseDetail = useCallback(() => {
    setSelectedServerId(null);
  }, []);

  const handleSelectServer = useCallback((id: string) => {
    setSelectedServerId((prev) => (prev === id ? null : id));
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
                Server Analytics
              </span>
            </div>
            {meta && (
              <div className="flex items-center gap-8">
                <Stat label="Servers" value={meta.serverCount} icon={<Server className="w-3.5 h-3.5" />} />
                <Stat label="Players Online" value={meta.totalPlayers} icon={<Users className="w-3.5 h-3.5" />} />
              </div>
            )}
          </div>
        </div>
      </header>

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
                  Loading servers...
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
                <ServerList
                  onSelectServer={handleSelectServer}
                  selectedServerId={selectedServerId}
                />
                {meta && (
                  <div className="mt-8 pt-4 border-t border-border text-xs text-muted text-center">
                    Last updated: {new Date(meta.cachedAt).toLocaleString()}
                    {meta.fetchTime && ` (${meta.fetchTime}ms)`}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detail sidebar */}
          <ServerDetail
            serverId={selectedServerId}
            onClose={handleCloseDetail}
          />
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
