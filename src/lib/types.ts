export interface ServerItem {
  id: string;
  hostname: string;
  clients: number;
  svMaxclients: number;
  gametype: string;
  mapname: string;
  resourceCount: number;
  projectName: string;
  projectDesc: string;
  tags: string;
  locale: string;
  server: string;
  bannerDetail: string;
}

export interface ServerDetailItem extends ServerItem {
  resources: string[];
}

export interface ResourceItem {
  name: string;
  count: number;
  players: number;
  globalRank: number;
}

export interface ResourceDetailServer {
  id: string;
  hostname: string;
  projectName: string;
  clients: number;
  svMaxclients: number;
  bannerDetail: string;
}

export interface ResourceDetailItem {
  name: string;
  count: number;
  players: number;
  servers: ResourceDetailServer[];
}

export interface Meta {
  serverCount: number;
  resourceCount: number;
  enrichedCount: number;
  totalPlayers: number;
  cachedAt: string;
}

export interface PaginatedResponse<T> {
  tab: string;
  items: T[];
  total: number;
  page: number;
  hasMore: boolean;
  meta: Meta;
}

export type SortDirection = "asc" | "desc";
