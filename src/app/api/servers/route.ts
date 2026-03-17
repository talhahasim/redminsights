import { NextRequest, NextResponse } from "next/server";
import {
  fetchAndDecodeServers,
  enrichAllServers,
  fetchSingleServer,
  type ServerInfo,
} from "@/lib/decoder";

export const runtime = "edge";

interface ResourceStats {
  count: number;
  players: number;
}

interface CacheData {
  servers: ServerInfo[];
  timestamp: number;
  resourceMap: Record<string, ResourceStats>;
  enrichedCount: number;
  totalPlayers: number;
}

const CACHE_KEY = "server_data_v1";
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

async function getKV(): Promise<KVNamespace | null> {
  try {
    // Access Cloudflare bindings from global context
    const env = (globalThis as unknown as { env?: { CACHE?: KVNamespace } }).env;
    return env?.CACHE || null;
  } catch {
    return null;
  }
}

async function getCachedData(kv: KVNamespace | null): Promise<CacheData | null> {
  if (!kv) return null;
  try {
    const data = await kv.get(CACHE_KEY, "json");
    return data as CacheData | null;
  } catch {
    return null;
  }
}

async function setCachedData(kv: KVNamespace | null, data: CacheData): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: 86400 });
  } catch (e) {
    console.error("KV write error:", e);
  }
}

async function fetchFreshData(doEnrich: boolean): Promise<CacheData> {
  console.log("[fetchFreshData] Fetching servers...");
  const servers = await fetchAndDecodeServers();
  console.log(`[fetchFreshData] Got ${servers.length} servers`);

  if (doEnrich) {
    console.log("[fetchFreshData] Starting enrichment...");
    await enrichAllServers(servers);
  }

  const enrichedCount = servers.filter((s) => s.resources.length > 0).length;
  const resourceMap = buildResourceMap(servers);
  const totalPlayers = servers.reduce((sum, s) => sum + s.clients, 0);

  console.log(`[fetchFreshData] Enriched: ${enrichedCount}/${servers.length}`);

  return {
    servers,
    timestamp: Date.now(),
    resourceMap,
    enrichedCount,
    totalPlayers,
  };
}

function buildMeta(data: CacheData) {
  return {
    serverCount: data.servers.length,
    resourceCount: Object.keys(data.resourceMap).length,
    enrichedCount: data.enrichedCount,
    totalPlayers: data.totalPlayers,
    cachedAt: new Date(data.timestamp).toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const kv = await getKV();

    // Try to get cached data
    let data = await getCachedData(kv);
    const now = Date.now();

    // Check if cache is stale
    const isStale = !data || now - data.timestamp > CACHE_DURATION;

    if (!data) {
      // No cache - fetch fresh (without enrichment for speed)
      data = await fetchFreshData(false);
      await setCachedData(kv, data);
    } else if (isStale) {
      // Cache stale - return old data but trigger background refresh
      // Note: In Edge Runtime we can't do true background work,
      // so we just return stale data
      console.log("[GET] Cache stale, returning old data");
    }

    // Meta-only endpoint
    if (searchParams.get("meta") === "true") {
      return NextResponse.json(buildMeta(data));
    }

    const tab = searchParams.get("tab") || "servers";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "40")));
    const search = (searchParams.get("search") || "").toLowerCase();
    const sort = searchParams.get("sort") || (tab === "servers" ? "clients" : "count");
    const dir = searchParams.get("dir") || "desc";

    // Single server lookup
    const id = searchParams.get("id");
    if (id) {
      const server = data.servers.find((s) => s.id === id);
      if (!server) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }

      // On-demand resource fetch if needed
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

    // Single resource lookup
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

    const meta = buildMeta(data);

    if (tab === "resources") {
      const allEntries = Object.entries(data.resourceMap)
        .map(([name, stats]) => ({ name, count: stats.count, players: stats.players }))
        .sort((a, b) => b.count - a.count);

      const globalRankMap = new Map<string, number>();
      allEntries.forEach((entry, idx) => globalRankMap.set(entry.name, idx + 1));

      let entries = allEntries.map((e) => ({ ...e, globalRank: globalRankMap.get(e.name)! }));

      if (search) {
        entries = entries.filter((r) => r.name.toLowerCase().includes(search));
      }

      entries.sort((a, b) => {
        let cmp = 0;
        if (sort === "name") cmp = a.name.localeCompare(b.name);
        else if (sort === "players") cmp = a.players - b.players;
        else cmp = a.count - b.count;
        return dir === "desc" ? -cmp : cmp;
      });

      const total = entries.length;
      const all = searchParams.get("all") === "true";
      const items = all ? entries : entries.slice((page - 1) * limit, page * limit);

      return NextResponse.json({ tab: "resources", items, total, page: all ? 1 : page, hasMore: all ? false : page * limit < total, meta });
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
      if (sort === "clients") cmp = a.clients - b.clients;
      else if (sort === "svMaxclients") cmp = a.svMaxclients - b.svMaxclients;
      else if (sort === "hostname") cmp = a.hostname.localeCompare(b.hostname);
      else if (sort === "resources") cmp = a.resources.length - b.resources.length;
      else cmp = a.clients - b.clients;
      return dir === "desc" ? -cmp : cmp;
    });

    const total = servers.length;
    const items = servers.slice((page - 1) * limit, page * limit).map(({ resources, ...rest }) => ({
      ...rest,
      resourceCount: resources.length,
    }));

    return NextResponse.json({ tab: "servers", items, total, page, hasMore: page * limit < total, meta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Enrichment endpoint - call this manually or via cron to populate cache
export async function POST(request: NextRequest) {
  try {
    const kv = await getKV();
    if (!kv) {
      return NextResponse.json({ error: "KV not available" }, { status: 500 });
    }

    console.log("[POST] Starting full enrichment...");
    const data = await fetchFreshData(true);
    await setCachedData(kv, data);

    return NextResponse.json({
      success: true,
      enrichedCount: data.enrichedCount,
      totalServers: data.servers.length,
      resourceCount: Object.keys(data.resourceMap).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
