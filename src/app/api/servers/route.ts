import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Simple server info - minimal fields
interface ServerInfo {
  id: string;
  hostname: string;
  clients: number;
  svMaxclients: number;
  projectName: string;
  projectDesc: string;
  tags: string;
  gametype: string;
  mapname: string;
  locale: string;
  bannerDetail: string;
}

// Cloudflare-safe: fetch from cfx API with timeout
async function fetchServersFromCfx(): Promise<ServerInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

  try {
    // Use the JSON API instead of protobuf stream - much simpler and more reliable
    const response = await fetch(
      "https://servers-frontend.fivem.net/api/servers/slim/",
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "RedMInsights/1.0",
        },
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[fetchServers] API returned ${response.status}`);
      return [];
    }

    const json = await response.json();

    if (!Array.isArray(json)) {
      console.error("[fetchServers] Response is not an array");
      return [];
    }

    // Filter for RedM servers and map to our format
    const servers: ServerInfo[] = [];

    for (const item of json) {
      try {
        const data = item.Data;
        if (!data) continue;

        // Only RedM servers
        const vars = data.vars || {};
        if (vars.gamename !== "rdr3") continue;

        servers.push({
          id: item.EndPoint || "",
          hostname: stripColors(data.hostname || ""),
          clients: data.clients || 0,
          svMaxclients: data.svMaxclients || 0,
          projectName: stripColors(vars.sv_projectName || ""),
          projectDesc: stripColors(vars.sv_projectDesc || ""),
          tags: vars.tags || "",
          gametype: data.gametype || "",
          mapname: data.mapname || "",
          locale: vars.locale || "",
          bannerDetail: vars.banner_detail || "",
        });
      } catch {
        // Skip malformed entries
      }
    }

    console.log(`[fetchServers] Found ${servers.length} RedM servers`);
    return servers;
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[fetchServers] Error: ${message}`);
    return [];
  }
}

function stripColors(str: string): string {
  return str.replace(/\^[0-9]/g, "").replace(/~[a-zA-Z]~/g, "").trim();
}

// GET handler - simple and robust
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = request.nextUrl;

    // Fetch servers
    const servers = await fetchServersFromCfx();

    if (servers.length === 0) {
      return NextResponse.json(
        {
          error: "Could not fetch server data. Please try again later.",
          servers: [],
          meta: {
            serverCount: 0,
            totalPlayers: 0,
            fetchTime: Date.now() - startTime,
          }
        },
        { status: 503 }
      );
    }

    // Calculate stats
    const totalPlayers = servers.reduce((sum, s) => sum + s.clients, 0);

    const meta = {
      serverCount: servers.length,
      totalPlayers,
      fetchTime: Date.now() - startTime,
      cachedAt: new Date().toISOString(),
    };

    // Meta-only endpoint
    if (searchParams.get("meta") === "true") {
      return NextResponse.json(meta);
    }

    // Single server lookup
    const id = searchParams.get("id");
    if (id) {
      const server = servers.find((s) => s.id === id);
      if (!server) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }
      return NextResponse.json(server);
    }

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "40")));
    const search = (searchParams.get("search") || "").toLowerCase();
    const sort = searchParams.get("sort") || "clients";
    const dir = searchParams.get("dir") || "desc";

    // Filter
    let filtered = servers;
    if (search) {
      filtered = servers.filter(
        (s) =>
          s.hostname.toLowerCase().includes(search) ||
          s.projectName.toLowerCase().includes(search) ||
          s.tags.toLowerCase().includes(search) ||
          s.id.toLowerCase().includes(search)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sort === "clients") cmp = a.clients - b.clients;
      else if (sort === "svMaxclients") cmp = a.svMaxclients - b.svMaxclients;
      else if (sort === "hostname") cmp = a.hostname.localeCompare(b.hostname);
      else cmp = a.clients - b.clients;
      return dir === "desc" ? -cmp : cmp;
    });

    // Paginate
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      items,
      total,
      page,
      hasMore: page * limit < total,
      meta,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GET] Fatal error: ${message}`);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: message,
        fetchTime: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function HEAD() {
  return new Response(null, { status: 200 });
}
