import type { Env, CrawlData } from './types';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export async function handleAPI(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const startTime = Date.now();
  const url = new URL(request.url);
  const params = url.searchParams;

  // Load data from KV
  const raw = await env.KV.get('data:latest');
  if (!raw) {
    return json({ error: 'No data available yet. Crawl in progress.' }, 503);
  }

  const data: CrawlData = JSON.parse(raw);
  const { servers, resourceMap } = data;
  const meta = { ...data.meta, fetchTime: Date.now() - startTime };

  // Meta only
  if (params.get('meta') === 'true') {
    return json(meta);
  }

  const tab = params.get('tab') || 'servers';
  const all = params.get('all') === 'true';
  const page = Math.max(1, parseInt(params.get('page') || '1'));
  const limit = all ? 10000 : Math.min(100, Math.max(1, parseInt(params.get('limit') || '40')));
  const search = (params.get('search') || '').toLowerCase();
  const sort = params.get('sort') || (tab === 'servers' ? 'clients' : 'count');
  const dir = params.get('dir') || 'desc';

  // Single server
  const id = params.get('id');
  if (id) {
    const server = servers.find((s) => s.id === id);
    if (!server) return json({ error: 'Not found' }, 404);
    return json({ ...server, resourceCount: server.resources.length });
  }

  // Single resource
  const resourceName = params.get('resource');
  if (resourceName) {
    const stats = resourceMap[resourceName];
    if (!stats) return json({ error: 'Not found' }, 404);
    const resourceServers = servers
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
    return json({ name: resourceName, count: stats.count, players: stats.players, servers: resourceServers });
  }

  // Resources tab
  if (tab === 'resources') {
    const allEntries = Object.entries(resourceMap)
      .map(([name, stats]) => ({ name, count: stats.count, players: stats.players }))
      .sort((a, b) => b.count - a.count);

    const globalRankMap = new Map<string, number>();
    allEntries.forEach((e, i) => globalRankMap.set(e.name, i + 1));

    let entries = allEntries.map((e) => ({ ...e, globalRank: globalRankMap.get(e.name)! }));
    if (search) entries = entries.filter((r) => r.name.toLowerCase().includes(search));

    entries.sort((a, b) => {
      let cmp = 0;
      if (sort === 'name') cmp = a.name.localeCompare(b.name);
      else if (sort === 'players') cmp = a.players - b.players;
      else cmp = a.count - b.count;
      return dir === 'desc' ? -cmp : cmp;
    });

    const total = entries.length;
    const items = entries.slice((page - 1) * limit, page * limit);
    return json({ tab: 'resources', items, total, page, hasMore: page * limit < total, meta });
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
    if (sort === 'clients') cmp = a.clients - b.clients;
    else if (sort === 'svMaxclients') cmp = a.svMaxclients - b.svMaxclients;
    else if (sort === 'hostname') cmp = a.hostname.localeCompare(b.hostname);
    else if (sort === 'resources') cmp = a.resources.length - b.resources.length;
    else cmp = a.clients - b.clients;
    return dir === 'desc' ? -cmp : cmp;
  });

  const total = filtered.length;
  const items = filtered.slice((page - 1) * limit, page * limit).map((s) => ({
    ...s,
    resourceCount: s.resources.length,
    resources: undefined,
  }));

  return json({ tab: 'servers', items, total, page, hasMore: page * limit < total, meta });
}
