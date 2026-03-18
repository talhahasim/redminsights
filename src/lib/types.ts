export interface ServerItem {
  resourceCount?: number;
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

export interface ResourceItem {
  name: string;
  count: number;
  players: number;
  globalRank: number;
}

export interface ResourceDetailItem {
  name: string;
  count: number;
  players: number;
  servers: {
    id: string;
    hostname: string;
    projectName: string;
    clients: number;
    svMaxclients: number;
    bannerDetail: string;
  }[];
}

export interface Meta {
  serverCount: number;
  resourceCount: number;
  totalPlayers: number;
  fetchTime?: number;
  cachedAt: string;
}

export interface ServerPaginatedResponse {
  tab: "servers";
  items: ServerItem[];
  total: number;
  page: number;
  hasMore: boolean;
  meta: Meta;
}

export interface ResourcePaginatedResponse {
  tab: "resources";
  items: ResourceItem[];
  total: number;
  page: number;
  hasMore: boolean;
  meta: Meta;
}

export type PaginatedResponse<T = ServerItem | ResourceItem> = {
  tab: string;
  items: T[];
  total: number;
  page: number;
  hasMore: boolean;
  meta: Meta;
};

export type SortDirection = "asc" | "desc";
export interface ServerDetailItem extends ServerItem { resources: string[]; }
