export interface ServerItem {
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
  resourceCount: number;
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
  serversWithResources: number;
  resourceCount: number;
  totalPlayers: number;
  totalBatches: number;
  fetchTime?: number;
  cachedAt: string;
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
