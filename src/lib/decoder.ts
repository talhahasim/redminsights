import { ServerMessage } from "./proto";

export interface ServerInfo {
  id: string;
  hostname: string;
  clients: number;
  svMaxclients: number;
  gametype: string;
  mapname: string;
  resources: string[];
  projectName: string;
  projectDesc: string;
  tags: string;
  locale: string;
  server: string;
  bannerDetail: string;
}

function stripCfxColors(str: string): string {
  return str.replace(/\^[0-9]/g, "").trim();
}

export async function fetchAndDecodeServers(): Promise<ServerInfo[]> {
  const url =
    "https://frontend.cfx-services.net/api/servers/stream/1771031730/";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch servers: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  const servers: ServerInfo[] = [];

  let offset = 0;

  while (offset + 4 <= data.length) {
    const frameLength =
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24);

    offset += 4;

    if (
      frameLength <= 0 ||
      frameLength > 65535 ||
      offset + frameLength > data.length
    ) {
      break;
    }

    const frame = data.slice(offset, offset + frameLength);
    offset += frameLength;

    try {
      const decoded = ServerMessage.decode(frame) as unknown as {
        EndPoint: string;
        Data: {
          svMaxclients: number;
          clients: number;
          hostname: string;
          gametype: string;
          mapname: string;
          server: string;
          vars: Record<string, string>;
        };
      };

      if (!decoded.Data) continue;

      const vars = decoded.Data.vars || {};

      // Only include RedM (rdr3) servers
      if (vars.gamename !== "rdr3") continue;

      servers.push({
        id: decoded.EndPoint,
        hostname: stripCfxColors(decoded.Data.hostname || ""),
        clients: decoded.Data.clients || 0,
        svMaxclients: decoded.Data.svMaxclients || 0,
        gametype: decoded.Data.gametype || "",
        mapname: decoded.Data.mapname || "",
        resources: [],
        projectName: stripCfxColors(vars.sv_projectName || ""),
        projectDesc: stripCfxColors(vars.sv_projectDesc || ""),
        tags: vars.tags || "",
        locale: vars.locale || "",
        server: decoded.Data.server || "",
        bannerDetail: vars.banner_detail || "",
      });
    } catch {
      // Skip malformed frames
    }
  }

  return servers;
}

interface SingleServerResponse {
  EndPoint: string;
  Data: {
    resources: string[];
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Track failure reasons for debugging
const failureStats = { timeout: 0, rateLimit: 0, httpError: 0, networkError: 0, noData: 0 };

export function getFailureStats() {
  return { ...failureStats };
}

export async function fetchSingleServer(id: string, retries = 2): Promise<string[] | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(
        `https://frontend.cfx-services.net/api/servers/single/${id}`,
        { signal: AbortSignal.timeout(6000) }
      );

      if (resp.status === 429) {
        failureStats.rateLimit++;
        await sleep(500 * (attempt + 1));
        continue;
      }

      if (!resp.ok) {
        failureStats.httpError++;
        return null;
      }

      const json = (await resp.json()) as SingleServerResponse;
      if (!json.Data?.resources) {
        failureStats.noData++;
        return null;
      }
      return json.Data.resources;
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        failureStats.timeout++;
      } else {
        failureStats.networkError++;
      }
      if (attempt < retries) {
        await sleep(300);
        continue;
      }
      return null;
    }
  }
  return null;
}

// Enrich all servers with very careful rate limiting for 100% accuracy
export async function enrichAllServers(
  servers: ServerInfo[],
  onProgress?: (enriched: number, total: number) => void
): Promise<void> {
  // Sort by players desc so most important servers get enriched first
  const toEnrich = [...servers].sort((a, b) => b.clients - a.clients);
  const total = toEnrich.length;

  console.log(`[enrich] Starting FULL enrichment of ${total} servers (this will take 30-40 min)`);

  let enrichedCount = 0;
  const failedIds: string[] = [];

  // Very conservative: 4 concurrent, 400ms delay
  const concurrency = 4;
  const baseDelay = 400;
  let nextIdx = 0;

  async function worker(workerId: number) {
    await sleep(workerId * 500);

    while (nextIdx < toEnrich.length) {
      const i = nextIdx++;
      const server = toEnrich[i];

      const resources = await fetchSingleServer(server.id);
      if (resources) {
        server.resources = resources;
        enrichedCount++;

        if (enrichedCount % 50 === 0) {
          console.log(`[enrich] Progress: ${enrichedCount}/${total} (${Math.round(enrichedCount/total*100)}%)`);
          onProgress?.(enrichedCount, total);
        }
      } else {
        failedIds.push(server.id);
      }

      await sleep(baseDelay);
    }
  }

  // First pass
  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));

  console.log(`[enrich] First pass complete: ${enrichedCount}/${total}, ${failedIds.length} failed`);

  // Second pass for failed servers (even slower)
  if (failedIds.length > 0 && failedIds.length < 1000) {
    console.log(`[enrich] Starting retry pass for ${failedIds.length} failed servers...`);

    for (const id of failedIds) {
      const server = servers.find(s => s.id === id);
      if (server && server.resources.length === 0) {
        await sleep(800); // Very slow
        const resources = await fetchSingleServer(id);
        if (resources) {
          server.resources = resources;
          enrichedCount++;
        }
      }
    }
  }

  const finalEnriched = servers.filter(s => s.resources.length > 0).length;
  console.log(`[enrich] COMPLETE: ${finalEnriched}/${total} servers enriched`);
}
