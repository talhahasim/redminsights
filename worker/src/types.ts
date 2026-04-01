export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface ServerInfo {
  id: string;
  hostname: string;
  clients: number;
  sv_maxclients: number;
  gametype: string;
  mapname: string;
  project_name: string;
  project_desc: string;
  tags: string;
  locale: string;
  banner_detail: string;
  addr: string;
}
