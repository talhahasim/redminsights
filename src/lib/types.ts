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
}

export interface Meta {
  serverCount: number;
  totalPlayers: number;
  fetchTime?: number;
  cachedAt: string;
}

export interface PaginatedResponse {
  items: ServerItem[];
  total: number;
  page: number;
  hasMore: boolean;
  meta: Meta;
}

export type SortDirection = "asc" | "desc";
