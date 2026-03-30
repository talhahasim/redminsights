import type { Env, ServerInfo, ResourceStats, CrawlData, CrawlState } from './types';

const ENRICH_BATCH_SIZE = 100;
const CRAWL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchServerResources(addr: string): Promise<string[]> {
  try {
    const res = await fetch(`http://${addr}/info.json`, {
      signal: AbortSignal.timeout(2000),
      headers: { 'User-Agent': 'RedMInsights/1.0' },
    });
    if (res.ok) {
      const info = await res.json() as { resources?: string[] };
      if (Array.isArray(info.resources)) {
        return info.resources;
      }
    }
  } catch {
    // Server unreachable
  }
  return [];
}

async function getState(env: Env): Promise<CrawlState> {
  const raw = await env.KV.get('crawl:state');
  if (raw) return JSON.parse(raw) as CrawlState;
  return { phase: 'idle', batchIndex: 0, startedAt: '' };
}

async function setState(env: Env, state: CrawlState): Promise<void> {
  await env.KV.put('crawl:state', JSON.stringify(state));
}

export async function handleCron(env: Env): Promise<void> {
  const state = await getState(env);

  if (state.phase === 'idle') {
    // Check if enough time has passed since last complete crawl
    const lastData = await env.KV.get('data:latest');
    if (lastData) {
      const data: CrawlData = JSON.parse(lastData);
      const age = Date.now() - new Date(data.meta.cachedAt).getTime();
      if (age < CRAWL_INTERVAL_MS) {
        return; // Data is still fresh
      }
    }

    // Fetch server list from Vercel (protobuf parsing happens there)
    console.log('Fetching server list from Vercel...');
    const res = await fetch(env.CRAWL_URL, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'RedMInsights-Worker/1.0' },
    });

    if (!res.ok) {
      console.error(`Crawl endpoint returned ${res.status}`);
      return;
    }

    const { servers } = await res.json() as { servers: Omit<ServerInfo, 'resources'>[] };
    if (!servers || servers.length === 0) {
      console.error('No servers returned');
      return;
    }

    // Add empty resources array to each server
    const serversWithResources: ServerInfo[] = servers.map((s) => ({
      ...s,
      resources: [],
    }));

    // Store raw server list for enrichment
    await env.KV.put('crawl:servers', JSON.stringify(serversWithResources));
    await setState(env, { phase: 'enriching', batchIndex: 0, startedAt: new Date().toISOString() });
    console.log(`Stored ${servers.length} servers, starting enrichment`);
    return;
  }

  if (state.phase === 'enriching') {
    const raw = await env.KV.get('crawl:servers');
    if (!raw) {
      await setState(env, { phase: 'idle', batchIndex: 0, startedAt: '' });
      return;
    }

    const servers: ServerInfo[] = JSON.parse(raw);
    const eligible = servers.filter((s) => s.addr && !s.addr.startsWith('https://'));
    const start = state.batchIndex * ENRICH_BATCH_SIZE;

    if (start >= eligible.length) {
      // All batches done, move to build phase
      await setState(env, { ...state, phase: 'building' });
      console.log('Enrichment complete, building final data');
      return;
    }

    const batch = eligible.slice(start, start + ENRICH_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (server) => {
        const resources = await fetchServerResources(server.addr!);
        server.resources = resources;
      })
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`Batch ${state.batchIndex}: ${succeeded}/${batch.length} enriched`);

    // Save updated servers back to KV
    await env.KV.put('crawl:servers', JSON.stringify(servers));
    await setState(env, { ...state, batchIndex: state.batchIndex + 1 });
    return;
  }

  if (state.phase === 'building') {
    const raw = await env.KV.get('crawl:servers');
    if (!raw) {
      await setState(env, { phase: 'idle', batchIndex: 0, startedAt: '' });
      return;
    }

    const servers: ServerInfo[] = JSON.parse(raw);

    // Build resource map
    const resourceMap: Record<string, ResourceStats> = {};
    for (const server of servers) {
      for (const resource of server.resources) {
        if (!resourceMap[resource]) resourceMap[resource] = { count: 0, players: 0 };
        resourceMap[resource].count += 1;
        resourceMap[resource].players += server.clients;
      }
    }

    const serversWithResources = servers.filter((s) => s.resources.length > 0).length;
    const totalPlayers = servers.reduce((sum, s) => sum + s.clients, 0);

    const data: CrawlData = {
      servers,
      resourceMap,
      meta: {
        serverCount: servers.length,
        serversWithResources,
        resourceCount: Object.keys(resourceMap).length,
        totalPlayers,
        cachedAt: new Date().toISOString(),
      },
    };

    // Backup and write final data
    const current = await env.KV.get('data:latest');
    if (current) {
      await env.KV.put('data:previous', current);
    }
    await env.KV.put('data:latest', JSON.stringify(data));

    // Cleanup intermediate data
    await env.KV.delete('crawl:servers');
    await setState(env, { phase: 'idle', batchIndex: 0, startedAt: '' });

    console.log(`Build complete: ${servers.length} servers, ${serversWithResources} enriched, ${Object.keys(resourceMap).length} resources`);
  }
}
