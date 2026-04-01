import { supabase } from './supabase';
import type {
  Meta,
  ServerItem,
  ServerDetailItem,
  ResourceItem,
  ResourceDetailItem,
  PaginatedResponse,
  SortDirection,
} from './types';

// ── Meta ──

export async function fetchMeta(): Promise<Meta> {
  const { data, error } = await supabase.rpc('get_meta');
  if (error) throw new Error(error.message);
  return data as Meta;
}

// ── Servers ──

type ServerSortField = 'clients' | 'svMaxclients' | 'hostname' | 'resources';

const SERVER_SORT_MAP: Record<ServerSortField, string> = {
  clients: 'clients',
  svMaxclients: 'sv_maxclients',
  hostname: 'hostname',
  resources: 'resource_count',
};

export async function fetchServers(
  page: number,
  search: string,
  sortField: ServerSortField,
  sortDir: SortDirection,
  limit = 30
): Promise<PaginatedResponse<ServerItem>> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('servers')
    .select('id, hostname, clients, sv_maxclients, gametype, mapname, project_name, project_desc, tags, locale, banner_detail, addr, resource_count', { count: 'exact' })
    .order(SERVER_SORT_MAP[sortField], { ascending: sortDir === 'asc' })
    .range(from, to);

  if (search) {
    query = query.or(
      `hostname.ilike.%${search}%,project_name.ilike.%${search}%,tags.ilike.%${search}%,id.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  const items: ServerItem[] = (data ?? []).map((s) => ({
    id: s.id,
    hostname: s.hostname,
    clients: s.clients,
    svMaxclients: s.sv_maxclients,
    gametype: s.gametype,
    mapname: s.mapname,
    projectName: s.project_name,
    projectDesc: s.project_desc,
    tags: s.tags,
    locale: s.locale,
    bannerDetail: s.banner_detail,
    addr: s.addr,
    resourceCount: s.resource_count,
  }));

  return {
    tab: 'servers',
    items,
    total,
    page,
    hasMore: page * limit < total,
  };
}

// ── Server Detail ──

export async function fetchServerDetail(id: string): Promise<ServerDetailItem> {
  const { data, error } = await supabase
    .from('servers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    hostname: data.hostname,
    clients: data.clients,
    svMaxclients: data.sv_maxclients,
    gametype: data.gametype,
    mapname: data.mapname,
    projectName: data.project_name,
    projectDesc: data.project_desc,
    tags: data.tags,
    locale: data.locale,
    bannerDetail: data.banner_detail,
    addr: data.addr,
    resourceCount: data.resource_count,
    resources: data.resources ?? [],
  };
}

// ── Resources ──

type ResourceSortField = 'count' | 'name' | 'players';

const RESOURCE_SORT_MAP: Record<ResourceSortField, string> = {
  count: 'server_count',
  players: 'total_players',
  name: 'name',
};

export async function fetchResources(
  page: number,
  search: string,
  sortField: ResourceSortField,
  sortDir: SortDirection,
  limit = 50
): Promise<PaginatedResponse<ResourceItem>> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('resource_stats')
    .select('name, server_count, total_players, global_rank', { count: 'exact' })
    .order(RESOURCE_SORT_MAP[sortField], { ascending: sortDir === 'asc' })
    .range(from, to);

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  const items: ResourceItem[] = (data ?? []).map((r) => ({
    name: r.name,
    count: r.server_count,
    players: r.total_players,
    globalRank: r.global_rank,
  }));

  return {
    tab: 'resources',
    items,
    total,
    page,
    hasMore: page * limit < total,
  };
}

// ── All Resources (CSV export) ──

export async function fetchAllResources(
  search: string,
  sortField: ResourceSortField,
  sortDir: SortDirection
): Promise<ResourceItem[]> {
  let query = supabase
    .from('resource_stats')
    .select('name, server_count, total_players, global_rank')
    .order(RESOURCE_SORT_MAP[sortField], { ascending: sortDir === 'asc' })
    .limit(10000);

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    name: r.name,
    count: r.server_count,
    players: r.total_players,
    globalRank: r.global_rank,
  }));
}

// ── Resource Detail ──

export async function fetchResourceDetail(name: string): Promise<ResourceDetailItem> {
  const [statsResult, serversResult] = await Promise.all([
    supabase
      .from('resource_stats')
      .select('name, server_count, total_players')
      .eq('name', name)
      .single(),
    supabase
      .from('servers')
      .select('id, hostname, project_name, clients, sv_maxclients, banner_detail')
      .contains('resources', [name])
      .order('clients', { ascending: false }),
  ]);

  if (statsResult.error) throw new Error(statsResult.error.message);

  return {
    name: statsResult.data.name,
    count: statsResult.data.server_count,
    players: statsResult.data.total_players,
    servers: (serversResult.data ?? []).map((s) => ({
      id: s.id,
      hostname: s.hostname,
      projectName: s.project_name,
      clients: s.clients,
      svMaxclients: s.sv_maxclients,
      bannerDetail: s.banner_detail,
    })),
  };
}
