export interface Env {
  KV: KVNamespace;
  CRAWL_URL: string;
}

export interface ServerInfo {
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

export interface ResourceStats {
  count: number;
  players: number;
}

export interface CrawlData {
  servers: ServerInfo[];
  resourceMap: Record<string, ResourceStats>;
  meta: {
    serverCount: number;
    serversWithResources: number;
    resourceCount: number;
    totalPlayers: number;
    cachedAt: string;
  };
}

export interface CrawlState {
  phase: 'idle' | 'enriching' | 'building';
  batchIndex: number;
  startedAt: string;
}
