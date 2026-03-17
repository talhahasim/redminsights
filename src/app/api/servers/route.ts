import { NextRequest, NextResponse } from "next/server";
import {
  fetchAndDecodeServers,
  enrichAllServers,
  fetchSingleServer,
  getFailureStats,
  type ServerInfo,
} from "@/lib/decoder";

// Required for Cloudflare Pages
export const runtime = "edge";

interface ResourceStats {
  count: number;
  players: number;
}

interface CacheEntry {
  servers: ServerInfo[];
  timestamp: number;
  resourceMap: Record<string, ResourceStats>;
  enrichedCount: number;
  totalPlayers: number;
}

let cache: CacheEntry | null = null;
let fetchPromise: Promise<void> | null = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function buildResourceMap(servers: ServerInfo[]): Record<string, ResourceStats> {
  const map: Record<string, ResourceStats> = {};
  for (const server of servers) {
    for (const resource of server.resources) {
      if (!map[resource]) {
        map[resource] = { count: 0, players: 0 };
      }
      map[resource].count += 1;
      map[resource].players += server.clients;
    }
  }
  return map;
}

const isProduction = process.env.NODE_ENV === 'production';

async function ensureData(): Promise<void> {
  const now = Date.now();

  if (cache && now - cache.timestamp < CACHE_DURATION) {
    return;
  }

  // Deduplicate concurrent requests
  if (fetchPromise) {
    await fetchPromise;
    return;
  }

  fetchPromise = (async () => {
    try {
      console.log("[ensureData] Fetching servers...");
      const servers = await fetchAndDecodeServers();
      console.log(`[ensureData] Got ${servers.length} servers`);

      // In production (Vercel), skip enrichment due to timeout limits
      // In development, do full enrichment
      if (!isProduction) {
        console.log("[ensureData] Starting full enrichment...");
        await enrichAllServers(servers);
      } else {
        console.log("[ensureData] Production mode - skipping enrichment (timeout limit)");
      }

      const enrichedCount = servers.filter((s) => s.resources.length > 0).length;
      const resourceMap = buildResourceMap(servers);
      const totalPlayers = servers.reduce((sum, s) => sum + s.clients, 0);

      console.log(`[ensureData] Final: ${enrichedCount}/${servers.length} servers enriched`);
      console.log(`[ensureData] Failures:`, getFailureStats());

      cache = {
        servers,
        timestamp: Date.now(),
        resourceMap,
        enrichedCount,
        totalPlayers,
      };
    } finally {
      fetchPromise = null;
    }
  })();

  await fetchPromise;
}

function buildMeta() {
  if (!cache) throw new Error("No data available");
  return {
    serverCount: cache.servers.length,
    resourceCount: Object.keys(cache.resourceMap).length,
    enrichedCount: cache.enrichedCount,
    totalPlayers: cache.totalPlayers,
    cachedAt: new Date(cache.timestamp).toISOString(),
  };
}

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    await ensureData();
    const data = cache!;

    // Meta-only endpoint
    if (searchParams.get("meta") === "true") {
      return NextResponse.json(buildMeta());
    }

    const tab = searchParams.get("tab") || "servers";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "40")));
    const search = (searchParams.get("search") || "").toLowerCase();
    const sort = searchParams.get("sort") || (tab === "servers" ? "clients" : "count");
    const dir = searchParams.get("dir") || "desc";

    // Single server lookup by ID
    const id = searchParams.get("id");
    if (id) {
      const server = data.servers.find((s) => s.id === id);
      if (!server) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }

      // On-demand resource fetch if not yet enriched
      if (server.resources.length === 0) {
        const resources = await fetchSingleServer(server.id);
        if (resources) {
          server.resources = resources;
        }
      }

      const { resources, ...rest } = server;
      return NextResponse.json({
        ...rest,
        resourceCount: resources.length,
        resources,
      });
    }

    // Single resource lookup by name
    const resourceName = searchParams.get("resource");
    if (resourceName) {
      const stats = data.resourceMap[resourceName];
      if (!stats) {
        return NextResponse.json({ error: "Resource not found" }, { status: 404 });
      }
      const servers = data.servers
        .filter((s) => s.resources.includes(resourceName))
        .sort((a, b) => b.clients - a.clients)
        .map((s) => ({
          id: s.id,
          hostname: s.hostname,
          projectName: s.projectName,
          clients: s.clients,
          svMaxclients: s.svMaxclients,
          bannerDetail: s.bannerDetail,
        }));

      return NextResponse.json({
        name: resourceName,
        count: stats.count,
        players: stats.players,
        servers,
      });
    }

    const meta = buildMeta();

    if (tab === "resources") {
      // Build global ranks based on count desc (always)
      const allEntries = Object.entries(data.resourceMap)
        .map(([name, stats]) => ({
          name,
          count: stats.count,
          players: stats.players,
        }))
        .sort((a, b) => b.count - a.count);

      const globalRankMap = new Map<string, number>();
      allEntries.forEach((entry, idx) => {
        globalRankMap.set(entry.name, idx + 1);
      });

      let entries = allEntries.map((e) => ({
        ...e,
        globalRank: globalRankMap.get(e.name)!,
      }));

      if (search) {
        entries = entries.filter((r) => r.name.toLowerCase().includes(search));
      }

      entries.sort((a, b) => {
        let cmp = 0;
        switch (sort) {
          case "name":
            cmp = a.name.localeCompare(b.name);
            break;
          case "players":
            cmp = a.players - b.players;
            break;
          default:
            cmp = a.count - b.count;
        }
        return dir === "desc" ? -cmp : cmp;
      });

      const total = entries.length;
      const all = searchParams.get("all") === "true";
      const items = all ? entries : entries.slice((page - 1) * limit, page * limit);

      return NextResponse.json({
        tab: "resources",
        items,
        total,
        page: all ? 1 : page,
        hasMore: all ? false : page * limit < total,
        meta,
      });
    }

    // Servers tab
    let servers = data.servers;

    if (search) {
      servers = servers.filter(
        (s) =>
          s.hostname.toLowerCase().includes(search) ||
          s.projectName.toLowerCase().includes(search) ||
          s.tags.toLowerCase().includes(search) ||
          s.id.toLowerCase().includes(search)
      );
    }

    servers = [...servers].sort((a, b) => {
      let cmp = 0;
      switch (sort) {
        case "clients":
          cmp = a.clients - b.clients;
          break;
        case "svMaxclients":
          cmp = a.svMaxclients - b.svMaxclients;
          break;
        case "hostname":
          cmp = a.hostname.localeCompare(b.hostname);
          break;
        case "resources":
          cmp = a.resources.length - b.resources.length;
          break;
        default:
          cmp = a.clients - b.clients;
      }
      return dir === "desc" ? -cmp : cmp;
    });

    const total = servers.length;
    const items = servers
      .slice((page - 1) * limit, page * limit)
      .map(({ resources, ...rest }) => ({
        ...rest,
        resourceCount: resources.length,
      }));

    return NextResponse.json({
      tab: "servers",
      items,
      total,
      page,
      hasMore: page * limit < total,
      meta,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
