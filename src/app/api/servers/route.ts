import { NextRequest, NextResponse } from "next/server";

// Allow up to 60s for initial data fetch (Vercel Hobby max)
export const maxDuration = 60;

// In-memory cache (persists across requests in Vercel serverless)
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface ResourceStats {
  count: number;
  players: number;
}

interface CacheEntry {
  servers: ServerInfo[];
  resourceMap: Record<string, ResourceStats>;
  meta: {
    serverCount: number;
    serversWithResources: number;
    resourceCount: number;
    totalPlayers: number;
    totalBatches: number;
    cachedAt: string;
  };
  timestamp: number;
}

let serverCache: CacheEntry | null = null;

function isCacheValid(): boolean {
  return serverCache !== null && Date.now() - serverCache.timestamp < CACHE_TTL;
}

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
  addr?: string;
  resources: string[];
}

function stripColors(str: string): string {
  return str.replace(/\^[0-9]/g, "").replace(/~[a-zA-Z]~/g, "").trim();
}

// Protobuf varint decoder (supports up to 64-bit but returns 32-bit safe)
function readVarint(buffer: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;

  while (pos < buffer.length && shift < 35) {
    const byte = buffer[pos];
    result |= (byte & 0x7f) << shift;
    pos++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

  return [result >>> 0, pos];
}

// Parse protobuf server entry
function parseServerEntry(data: Uint8Array): { endPoint: string; serverData: Record<string, unknown> } | null {
  try {
    let offset = 0;
    let endPoint = "";
    const serverData: Record<string, unknown> = { vars: {} };

    while (offset < data.length) {
      if (offset >= data.length) break;

      const [tag, newOffset] = readVarint(data, offset);
      offset = newOffset;

      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;

      if (wireType === 2) {
        const [length, lenOffset] = readVarint(data, offset);
        offset = lenOffset;

        if (offset + length > data.length) break;

        const fieldData = data.subarray(offset, offset + length);
        offset += length;

        if (fieldNumber === 1) {
          endPoint = new TextDecoder().decode(fieldData);
        } else if (fieldNumber === 2) {
          parseDataMessage(fieldData, serverData);
        }
      } else if (wireType === 0) {
        const [value, valOffset] = readVarint(data, offset);
        offset = valOffset;

        if (fieldNumber === 3) serverData.clients = value;
        if (fieldNumber === 4) serverData.svMaxclients = value;
      } else {
        break;
      }
    }

    return endPoint ? { endPoint, serverData } : null;
  } catch {
    return null;
  }
}

// Decode signed varint (zigzag encoding)
function decodeSignedVarint(value: number): number {
  return (value >>> 1) ^ -(value & 1);
}

// Parse Data embedded message
function parseDataMessage(data: Uint8Array, serverData: Record<string, unknown>): void {
  let offset = 0;
  const vars: Record<string, string> = {};

  while (offset < data.length) {
    if (offset >= data.length) break;

    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x7;

    if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;

      if (offset + length > data.length) break;

      const fieldData = data.subarray(offset, offset + length);
      offset += length;

      const text = new TextDecoder().decode(fieldData);

      switch (fieldNumber) {
        case 4: serverData.hostname = text; break;
        case 5: serverData.gametype = text; break;
        case 6: serverData.mapname = text; break;
        case 9: serverData.server = text; break;
        case 12:
          parseVarsField(fieldData, vars);
          break;
        case 18:
          serverData.addr = text;
          break;
      }
    } else if (wireType === 0) {
      const [value, valOffset] = readVarint(data, offset);
      offset = valOffset;

      switch (fieldNumber) {
        case 1: serverData.clients = value; break;
        case 11:
          const signed = decodeSignedVarint(value);
          serverData.svMaxclients = signed > 0 ? signed : value;
          break;
      }
    } else {
      if (wireType === 5) offset += 4;
      else if (wireType === 1) offset += 8;
      else break;
    }
  }

  serverData.vars = vars;
}

// Parse vars field (key-value protobuf)
function parseVarsField(data: Uint8Array, vars: Record<string, string>): void {
  let offset = 0;
  let key = "";
  let value = "";

  while (offset < data.length) {
    if (offset >= data.length) break;

    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x7;

    if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;

      if (offset + length > data.length) break;

      const fieldData = data.subarray(offset, offset + length);
      offset += length;

      const text = new TextDecoder().decode(fieldData);

      if (fieldNumber === 1) key = text;
      else if (fieldNumber === 2) value = text;
    } else {
      break;
    }
  }

  if (key) vars[key] = value;
}

// Fetch servers from CFX stream API (protobuf format)
async function fetchServers(): Promise<ServerInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const timestamp = Date.now();
    const response = await fetch(
      `https://frontend.cfx-services.net/api/servers/stream/${timestamp}/`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "*/*",
        },
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Stream API returned ${response.status}`);
      return [];
    }

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    const servers: ServerInfo[] = [];

    let offset = 0;

    while (offset < data.length) {
      if (offset + 4 > data.length) break;

      const length =
        data[offset] |
        (data[offset + 1] << 8) |
        (data[offset + 2] << 16) |
        (data[offset + 3] << 24);

      offset += 4;

      if (length <= 0 || length > 100000 || offset + length > data.length) break;

      const entryData = data.subarray(offset, offset + length);
      offset += length;

      const entry = parseServerEntry(entryData);
      if (!entry) continue;

      const { endPoint, serverData } = entry;
      const vars = (serverData.vars || {}) as Record<string, string>;

      if (vars.gamename !== "rdr3") continue;

      let maxClients = Number(serverData.svMaxclients) || 0;
      if (maxClients < 0 || maxClients > 10000) {
        maxClients = 0;
      }

      const clients = Number(serverData.clients) || 0;

      servers.push({
        id: endPoint,
        hostname: stripColors(String(serverData.hostname || "")),
        clients,
        svMaxclients: maxClients || clients,
        gametype: String(serverData.gametype || ""),
        mapname: String(serverData.mapname || ""),
        projectName: stripColors(vars.sv_projectName || ""),
        projectDesc: stripColors(vars.sv_projectDesc || ""),
        tags: vars.tags || "",
        locale: vars.locale || "",
        bannerDetail: vars.banner_detail || "",
        addr: String(serverData.addr || ""),
        resources: [],
      });
    }

    return servers;
  } catch (e) {
    clearTimeout(timeout);
    console.error("Stream fetch error:", e);
    return [];
  }
}

// Fetch resources from a server's info.json
async function fetchServerResources(addr: string): Promise<string[]> {
  try {
    const res = await fetch(`http://${addr}/info.json`, {
      signal: AbortSignal.timeout(3000),
      headers: { "User-Agent": "RedMInsights/1.0" },
    });
    if (res.ok) {
      const info = await res.json();
      if (Array.isArray(info.resources)) {
        return info.resources;
      }
    }
  } catch {
    // Server unreachable or slow
  }
  return [];
}

const ENRICH_BATCH_SIZE = 30;

// Get list of servers eligible for resource fetching
function getEligibleServers(servers: ServerInfo[]): ServerInfo[] {
  return servers.filter((s) => s.addr && !s.addr.startsWith('https://'));
}

// Fetch resources for a batch of servers
async function enrichBatch(servers: ServerInfo[], batchIndex: number): Promise<number> {
  const eligible = getEligibleServers(servers);
  const start = batchIndex * ENRICH_BATCH_SIZE;
  if (start >= eligible.length) return -1; // All done

  const batch = eligible.slice(start, start + ENRICH_BATCH_SIZE);
  const results = await Promise.allSettled(
    batch.map(async (server) => {
      const resources = await fetchServerResources(server.addr!);
      return { server, resources };
    })
  );
  for (const result of results) {
    if (result.status === 'fulfilled') {
      result.value.server.resources = result.value.resources;
    }
  }

  const nextStart = start + ENRICH_BATCH_SIZE;
  return nextStart >= eligible.length ? -1 : batchIndex + 1;
}

// Rebuild resource map and meta from current server data
function rebuildCache(): void {
  if (!serverCache) return;
  const { servers } = serverCache;
  const resourceMap: Record<string, ResourceStats> = {};
  for (const server of servers) {
    for (const resource of server.resources) {
      if (!resourceMap[resource]) resourceMap[resource] = { count: 0, players: 0 };
      resourceMap[resource].count += 1;
      resourceMap[resource].players += server.clients;
    }
  }
  const totalPlayers = servers.reduce((sum, s) => sum + s.clients, 0);
  const serversWithResources = servers.filter((s) => s.resources.length > 0).length;
  serverCache.resourceMap = resourceMap;
  serverCache.meta = {
    serverCount: servers.length,
    serversWithResources,
    resourceCount: Object.keys(resourceMap).length,
    totalPlayers,
    totalBatches: serverCache.meta.totalBatches,
    cachedAt: serverCache.meta.cachedAt,
  };
}

async function getCachedData(): Promise<CacheEntry | null> {
  if (isCacheValid()) return serverCache;

  const servers = await fetchServers();
  if (servers.length === 0) return null;

  const totalPlayers = servers.reduce((sum, s) => sum + s.clients, 0);
  const eligible = getEligibleServers(servers);

  serverCache = {
    servers,
    resourceMap: {},
    meta: {
      serverCount: servers.length,
      serversWithResources: 0,
      resourceCount: 0,
      totalPlayers,
      totalBatches: Math.ceil(eligible.length / ENRICH_BATCH_SIZE),
      cachedAt: new Date().toISOString(),
    },
    timestamp: Date.now(),
  };

  return serverCache;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = request.nextUrl;

    const cached = await getCachedData();
    if (!cached) {
      return NextResponse.json({ error: "Could not fetch data", servers: [] }, { status: 503 });
    }

    const { servers, resourceMap, meta: cachedMeta } = cached;
    const meta = { ...cachedMeta, fetchTime: Date.now() - startTime };

    const tab = searchParams.get("tab") || "servers";
    const all = searchParams.get("all") === "true";

    // Meta only
    if (searchParams.get("meta") === "true") {
      return NextResponse.json(meta);
    }

    // Batch enrich: fetch resources for batch N of servers
    const batchParam = searchParams.get("batchIndex");
    if (batchParam !== null) {
      const batchIndex = parseInt(batchParam);
      if (isNaN(batchIndex) || batchIndex < 0) {
        return NextResponse.json({ error: "Invalid batchIndex" }, { status: 400 });
      }
      const nextBatch = await enrichBatch(servers, batchIndex);
      rebuildCache();
      return NextResponse.json({
        nextBatchIndex: nextBatch,
        meta: { ...cached.meta, fetchTime: Date.now() - startTime },
      });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = all ? 10000 : Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "40")));
    const search = (searchParams.get("search") || "").toLowerCase();
    const sort = searchParams.get("sort") || (tab === "servers" ? "clients" : "count");
    const dir = searchParams.get("dir") || "desc";

    // Single server - fetch resources directly from server
    const id = searchParams.get("id");
    if (id) {
      const server = servers.find((s) => s.id === id);
      if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Try to fetch fresh resources if not already cached
      if (server.addr && server.resources.length === 0 && !server.addr.startsWith('https://')) {
        const resources = await fetchServerResources(server.addr);
        if (resources.length > 0) {
          server.resources = resources;
        }
      }

      return NextResponse.json({ ...server, resourceCount: server.resources.length });
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
