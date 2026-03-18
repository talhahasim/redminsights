import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

interface ServerInfo {
  id: string;
  hostname: string;
  clients: number;
  svMaxclients: number;
  gametype: string;
  mapname: string;
  projectName: string;
  projectDesc: string;
  tags: string;
  locale: string;
  bannerDetail: string;
  resources: string[];
}

interface ResourceStats {
  count: number;
  players: number;
}

function stripColors(str: string): string {
  return str.replace(/\^[0-9]/g, "").replace(/~[a-zA-Z]~/g, "").trim();
}

// Fetch servers from CFX JSON API
async function fetchServers(): Promise<ServerInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(
      "https://servers-frontend.fivem.net/api/servers/slim/",
      { signal: controller.signal, headers: { "User-Agent": "RedMInsights/1.0" } }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`API returned ${response.status}`);
      return [];
    }

    const json = await response.json();
    if (!Array.isArray(json)) return [];

    const servers: ServerInfo[] = [];
    for (const item of json) {
      try {
        const data = item.Data;
        if (!data) continue;
        const vars = data.vars || {};
        if (vars.gamename !== "rdr3") continue;

        servers.push({
          id: item.EndPoint || "",
          hostname: stripColors(data.hostname || ""),
          clients: data.clients || 0,
          svMaxclients: data.svMaxclients || 0,
          gametype: data.gametype || "",
          mapname: data.mapname || "",
          projectName: stripColors(vars.sv_projectName || ""),
          projectDesc: stripColors(vars.sv_projectDesc || ""),
          tags: vars.tags || "",
          locale: vars.locale || "",
          bannerDetail: vars.banner_detail || "",
          resources: data.resources || [],
        });
      } catch { /* skip */ }
    }
    return servers;
  } catch (e) {
    clearTimeout(timeout);
    console.error("Fetch error:", e);
    return [];
  }
}

// Build resource map from servers
function buildResourceMap(servers: ServerInfo[]): Record<string, ResourceStats> {
  const map: Record<string, ResourceStats> = {};
  for (const server of servers) {
    for (const resource of server.resources) {
      if (!map[resource]) map[resource] = { count: 0, players: 0 };
      map[resource].count += 1;
      map[resource].players += server.clients;
    }
  }
  return map;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = request.nextUrl;
    const servers = await fetchServers();

    if (servers.length === 0) {
      return NextResponse.json({ error: "Could not fetch data", servers: [] }, { status: 503 });
    }

    const resourceMap = buildResourceMap(servers);
    const totalPlayers = servers.reduce((sum, s) => sum + s.clients, 0);

    const meta = {
      serverCount: servers.length,
      resourceCount: Object.keys(resourceMap).length,
      totalPlayers,
      fetchTime: Date.now() - startTime,
      cachedAt: new Date().toISOString(),
    };

    // Meta only
    if (searchParams.get("meta") === "true") {
      return NextResponse.json(meta);
    }

    const tab = searchParams.get("tab") || "servers";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "40")));
    const search = (searchParams.get("search") || "").toLowerCase();
    const sort = searchParams.get("sort") || (tab === "servers" ? "clients" : "count");
    const dir = searchParams.get("dir") || "desc";

    // Single server
    const id = searchParams.get("id");
    if (id) {
      const server = servers.find((s) => s.id === id);
      if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(server);
    }

    // Single resource
    const resourceName = searchParams.get("resource");
    if (resourceName) {
      const stats = resourceMap[resourceName];
      if (!stats) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const resourceServers = servers
        .filter((s) => s.resources.includes(resourceName))
        .sort((a, b) => b.clients - a.clients)
        .map((s) => ({
          id: s.id, hostname: s.hostname, projectName: s.projectName,
          clients: s.clients, svMaxclients: s.svMaxclients, bannerDetail: s.bannerDetail,
        }));
      return NextResponse.json({ name: resourceName, count: stats.count, players: stats.players, servers: resourceServers });
    }

    // Resources tab
    if (tab === "resources") {
      const allEntries = Object.entries(resourceMap)
        .map(([name, stats]) => ({ name, count: stats.count, players: stats.players }))
        .sort((a, b) => b.count - a.count);

      const globalRankMap = new Map<string, number>();
      allEntries.forEach((e, i) => globalRankMap.set(e.name, i + 1));

      let entries = allEntries.map((e) => ({ ...e, globalRank: globalRankMap.get(e.name)! }));
      if (search) entries = entries.filter((r) => r.name.toLowerCase().includes(search));

      entries.sort((a, b) => {
        let cmp = 0;
        if (sort === "name") cmp = a.name.localeCompare(b.name);
        else if (sort === "players") cmp = a.players - b.players;
        else cmp = a.count - b.count;
        return dir === "desc" ? -cmp : cmp;
      });

      const total = entries.length;
      const items = entries.slice((page - 1) * limit, page * limit);
      return NextResponse.json({ tab: "resources", items, total, page, hasMore: page * limit < total, meta });
    }

    // Servers tab
    let filtered = servers;
    if (search) {
      filtered = servers.filter((s) =>
        s.hostname.toLowerCase().includes(search) ||
        s.projectName.toLowerCase().includes(search) ||
        s.tags.toLowerCase().includes(search) ||
        s.id.toLowerCase().includes(search)
      );
    }

    filtered = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sort === "clients") cmp = a.clients - b.clients;
      else if (sort === "svMaxclients") cmp = a.svMaxclients - b.svMaxclients;
      else if (sort === "hostname") cmp = a.hostname.localeCompare(b.hostname);
      else if (sort === "resources") cmp = a.resources.length - b.resources.length;
      else cmp = a.clients - b.clients;
      return dir === "desc" ? -cmp : cmp;
    });

    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit).map((s) => ({
      ...s, resourceCount: s.resources.length, resources: undefined,
    }));

    return NextResponse.json({ tab: "servers", items, total, page, hasMore: page * limit < total, meta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
